import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildVendorRiskRatingGradingPrompt } from '@/lib/grading/buildVendorRiskRatingGradingPrompt';
import {
  retrieveSp800161Guidance,
  type RetrievedSp800161Guidance,
} from '@/lib/nist/getSp800161Guidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Vendor risk rating scoring (SP 800-161 C-SCRM oriented).
 *
 * Deterministic:
 *   - rating present and on scale
 *   - rating in acceptableRatings (questionnaire-only Low/Moderate fails)
 *   - justification min length
 *   - optional theme keywords (access criticality / inherent risk / SCRM)
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned SP 800-161 educational excerpts
 *   - grade justification against retrieved text only — must account for
 *     access criticality, not questionnaire score alone
 */

export {
  VENDOR_RISK_MIN_JUSTIFICATION_LENGTH,
  VENDOR_RISK_RATING_LEVELS,
  VENDOR_RISK_RATING_LEVEL_LABELS,
  isVendorRiskRatingLevel,
  isVendorRiskRatingTicketType,
  type VendorRiskRatingLevel,
} from '@/lib/scoring/ticketUi';
import {
  VENDOR_RISK_MIN_JUSTIFICATION_LENGTH,
  VENDOR_RISK_RATING_LEVELS,
  isVendorRiskRatingLevel,
  type VendorRiskRatingLevel,
} from '@/lib/scoring/ticketUi';

export const VENDOR_RISK_RATING_TICKET_TYPES = [
  'vendor_risk_rating',
  'third_party_risk_rating',
  'scrm_vendor_assessment',
] as const;

export type VendorRiskRatingExpectedState = {
  acceptableRatings?: VendorRiskRatingLevel[];
  preferredRating?: VendorRiskRatingLevel;
  minJustificationLength?: number;
  requiredJustificationThemes?: string[];
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  rejectQuestionnaireOnlyLowRatings?: boolean;
};

export type VendorRiskRatingSubmission = {
  type?: string;
  rating: VendorRiskRatingLevel;
  justification: string;
};

export type VendorRiskRatingStructuredResult = {
  style: 'vendor_risk_rating';
  rating: VendorRiskRatingLevel | null;
  acceptableRatings: VendorRiskRatingLevel[];
  preferredRating: VendorRiskRatingLevel | null;
  ratingAcceptable: boolean;
  justificationLength: number;
  minJustificationLength: number;
  justificationLengthOk: boolean;
  requiredThemes: string[];
  missingThemes: string[];
  themesOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

/** Theme id → keyword phrases (any match counts for that theme). */
export const VENDOR_RISK_THEME_KEYWORDS: Record<string, string[]> = {
  access_criticality: [
    'access criticality',
    'access-criticality',
    'vendor criticality',
    'criticality of access',
    'privilege',
    'privileged',
    'production',
    'read-write',
    'read write',
    'api access',
    'data warehouse',
    'replaceability',
    'switching cost',
    'business impact',
  ],
  inherent_risk: [
    'inherent risk',
    'inherent',
    'residual risk',
    'residual',
    'control maturity',
  ],
  scrm: [
    'scrm',
    'c-scrm',
    'c scrm',
    'supply chain',
    '800-161',
    'sp 800-161',
    'third-party',
    'third party',
    'supplier',
    'subprocessor',
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeVendorRiskRatingLevel(
  value: unknown
): VendorRiskRatingLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'med' || normalized === 'medium') {
    return 'moderate';
  }
  if (normalized === 'crit') {
    return 'critical';
  }
  if (isVendorRiskRatingLevel(normalized)) {
    return normalized;
  }
  return null;
}

function resolveMinLength(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

export function parseVendorRiskRatingExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): VendorRiskRatingExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  let acceptableRatings: VendorRiskRatingLevel[] | undefined;
  const rawAcceptable =
    expectedState.acceptableRatings ?? expectedState.acceptable_ratings;
  if (Array.isArray(rawAcceptable)) {
    const levels = rawAcceptable
      .map((item) => normalizeVendorRiskRatingLevel(item))
      .filter((item): item is VendorRiskRatingLevel => item !== null);
    if (levels.length > 0) acceptableRatings = levels;
  }

  const preferredRating = normalizeVendorRiskRatingLevel(
    expectedState.preferredRating ?? expectedState.preferred_rating
  );

  const minJustificationLength =
    typeof expectedState.minJustificationLength === 'number' &&
    Number.isFinite(expectedState.minJustificationLength) &&
    expectedState.minJustificationLength > 0
      ? Math.floor(expectedState.minJustificationLength)
      : undefined;

  let requiredJustificationThemes: string[] | undefined;
  const rawThemes =
    expectedState.requiredJustificationThemes ??
    expectedState.required_justification_themes;
  if (Array.isArray(rawThemes)) {
    const themes = rawThemes
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (themes.length > 0) requiredJustificationThemes = themes;
  }

  let guidanceTopics: string[] | undefined;
  const rawTopics = expectedState.guidanceTopics ?? expectedState.policyTopics;
  if (Array.isArray(rawTopics)) {
    const topics = rawTopics
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (topics.length > 0) guidanceTopics = topics;
  }

  const topKGuidanceSections =
    typeof expectedState.topKGuidanceSections === 'number' &&
    Number.isFinite(expectedState.topKGuidanceSections) &&
    expectedState.topKGuidanceSections > 0
      ? Math.floor(expectedState.topKGuidanceSections)
      : undefined;

  const rejectQuestionnaireOnlyLowRatings =
    expectedState.rejectQuestionnaireOnlyLowRatings === true ||
    expectedState.reject_questionnaire_only_low_ratings === true;

  return {
    acceptableRatings,
    preferredRating: preferredRating ?? undefined,
    minJustificationLength,
    requiredJustificationThemes,
    guidanceTopics,
    topKGuidanceSections,
    rejectQuestionnaireOnlyLowRatings,
  };
}

export function extractVendorRiskRatingSubmission(
  submission: TicketSubmission
): VendorRiskRatingSubmission | null {
  const rating = normalizeVendorRiskRatingLevel(
    submission.rating ??
      submission.vendorRiskRating ??
      submission.vendor_risk_rating ??
      submission.riskRating
  );

  const justificationRaw =
    submission.justification ??
    submission.rationale ??
    submission.reason ??
    submission.ratingRationale;

  if (!rating || typeof justificationRaw !== 'string') {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'vendor_risk_rating',
    rating,
    justification: justificationRaw.trim(),
  };
}

export function justificationMatchesTheme(
  justification: string,
  themeId: string
): boolean {
  const keywords = VENDOR_RISK_THEME_KEYWORDS[themeId];
  if (!keywords || keywords.length === 0) {
    // Unknown theme ids: treat as substring match on the theme id tokens.
    const needle = themeId.replace(/_/g, ' ').toLowerCase();
    return justification.toLowerCase().includes(needle);
  }

  const haystack = justification.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function findMissingJustificationThemes(
  justification: string,
  requiredThemes: string[]
): string[] {
  return requiredThemes.filter(
    (theme) => !justificationMatchesTheme(justification, theme)
  );
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function vendorProfileTextFromTicket(
  ticket: ScorableTicket
): string | undefined {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial)) return undefined;

  const vendor = isPlainObject(initial.vendor) ? initial.vendor : null;
  const org = isPlainObject(initial.organization) ? initial.organization : null;

  const parts: string[] = [];

  if (org) {
    const orgName = typeof org.name === 'string' ? org.name.trim() : '';
    const orgSystem =
      typeof org.system === 'string'
        ? org.system.trim()
        : typeof org.systemName === 'string'
          ? org.systemName.trim()
          : '';
    if (orgName) parts.push(`organization: ${orgName}`);
    if (orgSystem) parts.push(`system: ${orgSystem}`);
  }

  if (!vendor) {
    return parts.length > 0 ? parts.join('\n') : undefined;
  }

  for (const key of ['name', 'service', 'description'] as const) {
    const value = vendor[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }

  const access = isPlainObject(vendor.accessCriticality)
    ? vendor.accessCriticality
    : isPlainObject(vendor.access_criticality)
      ? vendor.access_criticality
      : null;

  if (access) {
    const dataClasses = asStringArray(
      access.dataClasses ?? access.data_classes
    );
    if (dataClasses.length > 0) {
      parts.push(`dataClasses: ${dataClasses.join(', ')}`);
    }
    for (const key of [
      'privilegeLevel',
      'privilege_level',
      'businessImpact',
      'business_impact',
      'replaceability',
    ] as const) {
      const value = access[key];
      if (typeof value === 'string' && value.trim()) {
        parts.push(`${key}: ${value.trim()}`);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

function questionnaireSummaryFromTicket(
  ticket: ScorableTicket
): string | undefined {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial)) return undefined;
  const questionnaire = isPlainObject(initial.questionnaire)
    ? initial.questionnaire
    : null;
  if (!questionnaire) return undefined;

  const parts: string[] = [];
  const soc2 = isPlainObject(questionnaire.soc2) ? questionnaire.soc2 : null;
  if (soc2) {
    const status = typeof soc2.status === 'string' ? soc2.status.trim() : '';
    const periodEnd =
      typeof soc2.periodEnd === 'string'
        ? soc2.periodEnd.trim()
        : typeof soc2.period_end === 'string'
          ? soc2.period_end.trim()
          : '';
    const exceptions =
      typeof soc2.exceptions === 'string' ? soc2.exceptions.trim() : '';
    if (status) parts.push(`SOC 2 status: ${status}`);
    if (periodEnd) parts.push(`SOC 2 period end: ${periodEnd}`);
    if (exceptions) parts.push(`SOC 2 exceptions: ${exceptions}`);
  }

  const subprocessors = questionnaire.subprocessors;
  if (Array.isArray(subprocessors) && subprocessors.length > 0) {
    const lines = subprocessors
      .map((entry) => {
        if (!isPlainObject(entry)) return '';
        const name =
          typeof entry.name === 'string' ? entry.name.trim() : 'Unknown';
        const location =
          typeof entry.location === 'string' ? entry.location.trim() : '';
        const role = typeof entry.role === 'string' ? entry.role.trim() : '';
        return [name, location, role].filter(Boolean).join(' — ');
      })
      .filter(Boolean);
    if (lines.length > 0) {
      parts.push(`Subprocessors: ${lines.join('; ')}`);
    }
  }

  const breaches = questionnaire.breachHistory ?? questionnaire.breach_history;
  if (Array.isArray(breaches) && breaches.length > 0) {
    const lines = breaches
      .map((entry) => {
        if (!isPlainObject(entry)) return '';
        const year =
          typeof entry.year === 'number'
            ? String(entry.year)
            : typeof entry.year === 'string'
              ? entry.year.trim()
              : '';
        const summary =
          typeof entry.summary === 'string' ? entry.summary.trim() : '';
        if (!year && !summary) return '';
        return year ? `${year}: ${summary}` : summary;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      parts.push(`Breach history: ${lines.join('; ')}`);
    }
  }

  const other = isPlainObject(questionnaire.otherControls)
    ? questionnaire.otherControls
    : isPlainObject(questionnaire.other_controls)
      ? questionnaire.other_controls
      : null;
  if (other) {
    const flags = Object.entries(other)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(', ');
    if (flags) parts.push(`Other controls: ${flags}`);
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

function resolveRatingScale(
  ticket: ScorableTicket
): readonly VendorRiskRatingLevel[] {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial) || !Array.isArray(initial.ratingScale)) {
    return VENDOR_RISK_RATING_LEVELS;
  }
  const levels = initial.ratingScale
    .map((item) => normalizeVendorRiskRatingLevel(item))
    .filter((item): item is VendorRiskRatingLevel => item !== null);
  return levels.length > 0 ? levels : VENDOR_RISK_RATING_LEVELS;
}

export function evaluateVendorRiskRatingDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: VendorRiskRatingSubmission | null;
  structured: VendorRiskRatingStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseVendorRiskRatingExpectedState(ticket.expected_state);
  const minLength = resolveMinLength(
    expected.minJustificationLength,
    VENDOR_RISK_MIN_JUSTIFICATION_LENGTH
  );
  const acceptableRatings =
    expected.acceptableRatings && expected.acceptableRatings.length > 0
      ? expected.acceptableRatings
      : (['high', 'critical'] as VendorRiskRatingLevel[]);
  const preferredRating = expected.preferredRating ?? null;
  const requiredThemes = expected.requiredJustificationThemes ?? [];
  const parsed = extractVendorRiskRatingSubmission(submission);
  const scale = resolveRatingScale(ticket);

  const baseStructured: VendorRiskRatingStructuredResult = {
    style: 'vendor_risk_rating',
    rating: parsed?.rating ?? null,
    acceptableRatings,
    preferredRating,
    ratingAcceptable: false,
    justificationLength: parsed?.justification.length ?? 0,
    minJustificationLength: minLength,
    justificationLengthOk: false,
    requiredThemes,
    missingThemes: [],
    themesOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include a vendor risk rating (Low/Moderate/High/Critical) and a justification.',
    };
  }

  if (!scale.includes(parsed.rating)) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        rating: parsed.rating,
        reason: 'rating_out_of_scale',
      },
      ok: false,
      feedback: `Rating must be one of: ${scale.join(', ')}.`,
    };
  }

  const ratingAcceptable = acceptableRatings.includes(parsed.rating);
  const justificationLength = parsed.justification.length;
  const justificationLengthOk = justificationLength >= minLength;
  const missingThemes = findMissingJustificationThemes(
    parsed.justification,
    requiredThemes
  );
  const themesOk = missingThemes.length === 0;

  const structured: VendorRiskRatingStructuredResult = {
    ...baseStructured,
    rating: parsed.rating,
    ratingAcceptable,
    justificationLength,
    justificationLengthOk,
    missingThemes,
    themesOk,
  };

  if (!ratingAcceptable) {
    const rejectLow =
      expected.rejectQuestionnaireOnlyLowRatings !== false &&
      (parsed.rating === 'low' || parsed.rating === 'moderate');
    structured.reason = rejectLow
      ? 'questionnaire_only_rating_too_low'
      : 'rating_not_acceptable';
    return {
      parsed,
      structured,
      ok: false,
      feedback: rejectLow
        ? `Rating "${parsed.rating}" is too low for this vendor. Under SP 800-161 C-SCRM, access criticality and inherent risk (production privilege, sensitive data, business impact, replaceability) must elevate the rating even when the questionnaire looks strong (SOC 2, limited breach history). Acceptable ratings: ${acceptableRatings.join(', ')}.`
        : `Rating "${parsed.rating}" is not in the acceptable band for this scenario (${acceptableRatings.join(', ')}). Re-evaluate using access criticality and inherent risk, not questionnaire score alone.`,
    };
  }

  if (!justificationLengthOk) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Justification must be at least ${minLength} characters. Explain how access criticality / inherent risk drives the rating under SP 800-161 C-SCRM — do not rely only on SOC 2 or questionnaire hygiene.`,
    };
  }

  if (!themesOk) {
    structured.reason = 'missing_justification_themes';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Justification is missing required SCRM themes: ${missingThemes.join(', ')}. Address access criticality, inherent risk, and supply-chain / SCRM concepts — not only questionnaire results.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading justification against pinned SP 800-161 C-SCRM guidance…',
  };
}

async function gradeJustificationWithGuidance(
  parsed: VendorRiskRatingSubmission,
  ticket: ScorableTicket,
  expected: VendorRiskRatingExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrieved: RetrievedSp800161Guidance;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const query = [parsed.rating, parsed.justification].join('\n');

  const retrieved = retrieveSp800161Guidance(query, {
    topK: expected.topKGuidanceSections,
    requiredSectionIds,
  });

  const prompt = buildVendorRiskRatingGradingPrompt(retrieved, {
    rating: parsed.rating,
    justification: parsed.justification,
    scenarioBrief: ticket.scenario_brief,
    vendorProfileText: vendorProfileTextFromTicket(ticket),
    questionnaireSummaryText: questionnaireSummaryFromTicket(ticket),
  });

  const grading = await callClaudeGrading(prompt);
  return { grading, retrieved };
}

export const vendorRiskRatingTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateVendorRiskRatingDeterministic(
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

    const expected = parseVendorRiskRatingExpectedState(ticket.expected_state);

    try {
      const { grading, retrieved } = await gradeJustificationWithGuidance(
        deterministic.parsed,
        ticket,
        expected
      );

      const structured: VendorRiskRatingStructuredResult = {
        ...deterministic.structured,
        guidancePath: retrieved.catalogPath,
        retrievedSectionIds: retrieved.sections.map((section) => section.id),
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
        const structured: VendorRiskRatingStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Rating band and justification length look good, but AI grading against the pinned SP 800-161 C-SCRM guidance is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Vendor risk rating grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'vendor_risk_rating_grade',
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
          'Could not grade your justification against the pinned SP 800-161 C-SCRM guidance. Please try again shortly.',
      };
    }
  },
};
