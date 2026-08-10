import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildPolicySectionDraftGradingPrompt } from '@/lib/grading/buildPolicySectionDraftGradingPrompt';
import { retrievePolicyWritingGuidance } from '@/lib/grc/getPolicyWritingGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { POLICY_SECTION_DRAFT_MIN_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Policy section draft scoring (acceptable use / access control, etc.).
 *
 * Deterministic:
 *   - draft present + min length
 *   - optional requiredThemes: each theme must match synonym keywords in draft
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned policy-writing rubric
 *   - grade draft against retrieved text only
 */

export {
  POLICY_SECTION_DRAFT_MIN_LENGTH,
  isPolicySectionDraftTicketType,
} from '@/lib/scoring/ticketUi';

export const POLICY_SECTION_DRAFT_TICKET_TYPES = [
  'policy_section_draft',
  'policy_draft',
  'draft_policy_section',
] as const;

export type PolicySectionDraftTicketType =
  (typeof POLICY_SECTION_DRAFT_TICKET_TYPES)[number];

export type PolicySectionDraftExpectedState = {
  minDraftLength?: number;
  /** Theme ids that must appear via synonym keywords in the draft. */
  requiredThemes?: string[];
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  /**
   * Optional theme-coverage threshold (0–100). Default 100 = all required
   * themes must match. Used only for the deterministic theme gate.
   */
  passThresholdPercent?: number;
};

export type PolicySectionDraftSubmission = {
  type?: string;
  draft: string;
  sectionTitle?: string;
};

export type PolicySectionDraftStructuredResult = {
  style: 'policy_section_draft';
  draftLength: number;
  minDraftLength: number;
  draftLengthOk: boolean;
  sectionTitle: string | null;
  requiredThemes: string[];
  themesFound: string[];
  themesMissing: string[];
  themesOk: boolean;
  themeCoveragePercent: number;
  passThresholdPercent: number;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

/** Synonym keywords per theme id (case-insensitive substring match). */
const THEME_KEYWORD_MAP: Record<string, string[]> = {
  scope: [
    'scope',
    'applies to',
    'applicability',
    'covered',
    'workforce',
    'employees',
    'contractors',
    'in scope',
    'this policy applies',
  ],
  enforceable_language: [
    'must',
    'shall',
    'is required',
    'are required',
    'prohibited',
    'may not',
    'must not',
    'forbidden',
    'is forbidden',
  ],
  exceptions_process: [
    'exception',
    'exceptions',
    'waiver',
    'approval',
    'approve',
    'request an exception',
    'exception request',
    'time-bound',
    'time bound',
    'compensating',
  ],
  // Allow section-id style aliases from seeds/admins
  'clear-scope': [
    'scope',
    'applies to',
    'applicability',
    'covered',
    'workforce',
  ],
  'enforceable-language': [
    'must',
    'shall',
    'prohibited',
    'may not',
    'must not',
  ],
  'exceptions-process': [
    'exception',
    'waiver',
    'approval',
    'approve',
    'request',
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return undefined;
}

export function parsePolicySectionDraftExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): PolicySectionDraftExpectedState {
  if (!isPlainObject(expectedState)) return {};

  const minDraftLength =
    readPositiveInt(expectedState.minDraftLength) ??
    readPositiveInt(expectedState.min_draft_length);

  let requiredThemes: string[] | undefined;
  const rawThemes =
    expectedState.requiredThemes ??
    expectedState.required_themes ??
    expectedState.expectedThemes;
  if (Array.isArray(rawThemes)) {
    const themes = rawThemes
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (themes.length > 0) requiredThemes = themes;
  }

  let guidanceTopics: string[] | undefined;
  const rawTopics =
    expectedState.guidanceTopics ?? expectedState.guidance_topics;
  if (Array.isArray(rawTopics)) {
    const topics = rawTopics
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (topics.length > 0) guidanceTopics = topics;
  }

  const topKGuidanceSections =
    readPositiveInt(expectedState.topKGuidanceSections) ??
    readPositiveInt(expectedState.top_k_guidance_sections);

  const thresholdRaw =
    expectedState.passThresholdPercent ??
    expectedState.pass_threshold_percent ??
    expectedState.passThreshold;
  let passThresholdPercent: number | undefined;
  if (
    typeof thresholdRaw === 'number' &&
    Number.isFinite(thresholdRaw) &&
    thresholdRaw >= 0
  ) {
    passThresholdPercent = Math.min(100, Math.floor(thresholdRaw));
  }

  return {
    minDraftLength,
    requiredThemes,
    guidanceTopics,
    topKGuidanceSections,
    passThresholdPercent,
  };
}

export function extractPolicySectionDraftSubmission(
  submission: TicketSubmission
): PolicySectionDraftSubmission | null {
  const draft =
    asNonEmptyString(submission.draft) ??
    asNonEmptyString(submission.policyDraft) ??
    asNonEmptyString(submission.policy_draft) ??
    asNonEmptyString(submission.sectionDraft) ??
    asNonEmptyString(submission.section_draft) ??
    asNonEmptyString(submission.text);

  if (!draft) return null;

  const sectionTitle =
    asNonEmptyString(submission.sectionTitle) ??
    asNonEmptyString(submission.section_title) ??
    undefined;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'policy_section_draft',
    draft,
    ...(sectionTitle ? { sectionTitle } : {}),
  };
}

function resolveSectionTitle(
  ticket: ScorableTicket,
  submissionTitle?: string
): string | null {
  if (submissionTitle?.trim()) return submissionTitle.trim();

  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  if (!initial) return null;

  return (
    asNonEmptyString(initial.sectionTitle) ??
    asNonEmptyString(initial.section_title) ??
    asNonEmptyString(initial.section) ??
    null
  );
}

function keywordsForTheme(theme: string): string[] {
  const key = theme.trim().toLowerCase().replace(/\s+/g, '_');
  const hyphenKey = key.replace(/_/g, '-');
  const mapped = THEME_KEYWORD_MAP[key] ?? THEME_KEYWORD_MAP[hyphenKey];
  if (mapped && mapped.length > 0) return mapped;
  // Fallback: treat the theme string itself (and spaced form) as the keyword.
  const spaced = theme.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return [spaced, theme.trim().toLowerCase()].filter(Boolean);
}

export function findPolicyThemes(
  draft: string,
  themes: string[]
): { found: string[]; missing: string[] } {
  const lower = draft.toLowerCase();
  const found: string[] = [];
  const missing: string[] = [];

  for (const theme of themes) {
    const keywords = keywordsForTheme(theme);
    const matched = keywords.some((keyword) => lower.includes(keyword));
    if (matched) {
      found.push(theme);
    } else {
      missing.push(theme);
    }
  }

  return { found, missing };
}

function formatOrganizationText(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const org = isPlainObject(initialState.organization)
    ? initialState.organization
    : isPlainObject(initialState.org)
      ? initialState.org
      : null;

  if (!org) return undefined;

  const parts: string[] = [];
  for (const key of ['name', 'industry', 'size', 'constraints'] as const) {
    const value = org[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }

  const systems = org.systems;
  if (Array.isArray(systems)) {
    const items = systems
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length > 0) {
      parts.push(`systems: ${items.join('; ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

function formatRequirement(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  return (
    asNonEmptyString(initialState.requirement) ??
    asNonEmptyString(initialState.policyRequirement) ??
    asNonEmptyString(initialState.policy_requirement) ??
    undefined
  );
}

function formatPrompt(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  return (
    asNonEmptyString(initialState.prompt) ??
    asNonEmptyString(initialState.instructions) ??
    undefined
  );
}

export function evaluatePolicySectionDraftDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: PolicySectionDraftSubmission | null;
  structured: PolicySectionDraftStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parsePolicySectionDraftExpectedState(ticket.expected_state);
  const minDraftLength =
    expected.minDraftLength ?? POLICY_SECTION_DRAFT_MIN_LENGTH;
  const requiredThemes = expected.requiredThemes ?? [];
  const passThresholdPercent = expected.passThresholdPercent ?? 100;
  const parsed = extractPolicySectionDraftSubmission(submission);
  const sectionTitle = resolveSectionTitle(ticket, parsed?.sectionTitle);

  const baseStructured: PolicySectionDraftStructuredResult = {
    style: 'policy_section_draft',
    draftLength: parsed?.draft.length ?? 0,
    minDraftLength,
    draftLengthOk: false,
    sectionTitle,
    requiredThemes,
    themesFound: [],
    themesMissing: requiredThemes,
    themesOk: requiredThemes.length === 0,
    themeCoveragePercent: requiredThemes.length === 0 ? 100 : 0,
    passThresholdPercent,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback: 'Submission must include a policy section draft.',
    };
  }

  const draftLength = parsed.draft.length;
  const draftLengthOk = draftLength >= minDraftLength;
  const { found: themesFound, missing: themesMissing } = findPolicyThemes(
    parsed.draft,
    requiredThemes
  );
  const themeCoveragePercent =
    requiredThemes.length === 0
      ? 100
      : Math.round((themesFound.length / requiredThemes.length) * 100);
  const themesOk = themeCoveragePercent >= passThresholdPercent;

  const structured: PolicySectionDraftStructuredResult = {
    ...baseStructured,
    draftLength,
    draftLengthOk,
    sectionTitle,
    themesFound,
    themesMissing,
    themesOk,
    themeCoveragePercent,
  };

  if (!draftLengthOk) {
    structured.reason = 'draft_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Policy draft must be at least ${minDraftLength} characters. Expand scope, enforceable requirements, and the exceptions process.`,
    };
  }

  if (!themesOk) {
    structured.reason = 'missing_themes';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Draft is missing required policy themes (coverage ${themeCoveragePercent}% < ${passThresholdPercent}%): ${themesMissing.join(', ')}. Address clear scope, enforceable must/shall language, and a defined exceptions process.`,
    };
  }

  return {
    parsed: {
      ...parsed,
      sectionTitle: sectionTitle ?? parsed.sectionTitle,
    },
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading policy draft against pinned writing rubric…',
  };
}

async function gradeDraftWithGuidance(
  parsed: PolicySectionDraftSubmission,
  ticket: ScorableTicket,
  expected: PolicySectionDraftExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    parsed.sectionTitle,
    parsed.draft,
    formatRequirement(ticket.initial_state),
    formatOrganizationText(ticket.initial_state),
  ]
    .filter(Boolean)
    .join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrievePolicyWritingGuidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const prompt = buildPolicySectionDraftGradingPrompt(retrieved, {
    sectionTitle: parsed.sectionTitle ?? 'Policy section',
    draft: parsed.draft,
    scenarioBrief: ticket.scenario_brief,
    organizationText: formatOrganizationText(ticket.initial_state),
    requirement: formatRequirement(ticket.initial_state),
    prompt: formatPrompt(ticket.initial_state),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const policySectionDraftTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluatePolicySectionDraftDeterministic(
      submission,
      ticket
    );

    if (!deterministic.ok || !deterministic.parsed) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parsePolicySectionDraftExpectedState(
      ticket.expected_state
    );

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeDraftWithGuidance(deterministic.parsed, ticket, expected);

      const structured: PolicySectionDraftStructuredResult = {
        ...deterministic.structured,
        guidancePath,
        retrievedSectionIds,
        grading: {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
        },
      };

      if (grading.finding_state === 'satisfied') {
        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: grading.feedback,
        };
      }

      structured.reason = `grading_${grading.finding_state}`;
      const gapHint =
        grading.gaps.length > 0
          ? ` Gaps: ${grading.gaps.slice(0, 3).join(' ')}`
          : '';

      return {
        status: 'needs_revision',
        structuredResult: structured,
        feedback: `${grading.feedback}${gapHint}`,
      };
    } catch (error) {
      if (error instanceof MissingAnthropicApiKeyError) {
        const structured: PolicySectionDraftStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Draft length and required themes look good, but AI grading against the pinned policy-writing rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Policy section draft RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'policy_section_draft_rag_grade',
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        level: 'error',
      });

      return {
        status: 'needs_revision',
        structuredResult: {
          ...deterministic.structured,
          reason: 'grading_error',
        },
        feedback:
          'Could not grade your policy draft against the pinned writing rubric. Please try again shortly.',
      };
    }
  },
};
