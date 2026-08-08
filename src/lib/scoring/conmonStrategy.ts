import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildConMonStrategyGradingPrompt } from '@/lib/grading/buildConMonStrategyGradingPrompt';
import { retrieveSp800137Guidance } from '@/lib/nist/getSp800137Guidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Tier 3 continuous monitoring strategy memo scoring.
 *
 * Deterministic:
 *   - cadence rows for required control families
 *   - tool→family coverage for DefectDojo, CloudSploit, Scuba
 *   - escalation/reporting narrative meets minimum length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned SP 800-137 guidance text
 *   - grade memo against retrieved text only
 */

export const CONMON_STRATEGY_MIN_FIELD_LENGTH = 40;
export const CONMON_STRATEGY_MIN_ESCALATION_LENGTH = 80;

export const DEFAULT_CONMON_CONTROL_FAMILIES = [
  'AC',
  'AU',
  'CA',
  'CM',
  'IA',
  'RA',
  'SC',
  'SI',
] as const;

export const CONMON_TOOLS = ['DefectDojo', 'CloudSploit', 'Scuba'] as const;

export type ConMonToolName = (typeof CONMON_TOOLS)[number];

export type ConMonFamilyCadence = {
  family: string;
  cadence: string;
  rationale: string;
};

export type ConMonToolCoverage = {
  tool: string;
  families: string[];
  rationale: string;
};

export type ConMonStrategyExpectedState = {
  requiredFamilies?: string[];
  requiredTools?: string[];
  minFieldLength?: number;
  minEscalationLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type ConMonStrategySubmission = {
  type?: string;
  familyCadences: ConMonFamilyCadence[];
  toolCoverage: ConMonToolCoverage[];
  escalationReporting: string;
};

export type ConMonStrategyStructuredResult = {
  style: 'conmon_strategy';
  familiesCovered: string[];
  missingFamilies: string[];
  toolsCovered: string[];
  missingTools: string[];
  escalationLength: number;
  minEscalationLength: number;
  fieldLengthOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeFamily(family: string): string {
  return family.trim().toUpperCase();
}

function normalizeTool(tool: string): string {
  const trimmed = tool.trim().toLowerCase();
  if (trimmed === 'defectdojo' || trimmed === 'defect dojo') return 'DefectDojo';
  if (
    trimmed === 'cloudsploit' ||
    trimmed === 'cloud sploit' ||
    trimmed === 'aqua cloudsploit'
  ) {
    return 'CloudSploit';
  }
  if (trimmed === 'scuba' || trimmed === 'cisa scuba') return 'Scuba';
  return tool.trim();
}

export function parseConMonStrategyExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ConMonStrategyExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as ConMonStrategyExpectedState;
}

function parseFamilyCadence(raw: unknown): ConMonFamilyCadence | null {
  if (!isPlainObject(raw)) return null;
  const family = asNonEmptyString(raw.family);
  const cadence = asNonEmptyString(raw.cadence);
  const rationale = asNonEmptyString(raw.rationale);
  if (!family || !cadence || !rationale) return null;
  return {
    family: normalizeFamily(family),
    cadence,
    rationale,
  };
}

function parseToolCoverage(raw: unknown): ConMonToolCoverage | null {
  if (!isPlainObject(raw)) return null;
  const toolRaw = asNonEmptyString(raw.tool);
  const rationale = asNonEmptyString(raw.rationale);
  if (!toolRaw || !rationale) return null;

  const familiesRaw = raw.families ?? raw.controlFamilies ?? raw.control_families;
  let families: string[] = [];
  if (Array.isArray(familiesRaw)) {
    families = familiesRaw
      .map((entry) => (typeof entry === 'string' ? normalizeFamily(entry) : ''))
      .filter(Boolean);
  } else if (typeof familiesRaw === 'string') {
    families = familiesRaw
      .split(/[,;\s]+/)
      .map((entry) => normalizeFamily(entry))
      .filter(Boolean);
  }

  if (families.length === 0) return null;

  return {
    tool: normalizeTool(toolRaw),
    families,
    rationale,
  };
}

export function extractConMonStrategySubmission(
  submission: TicketSubmission
): ConMonStrategySubmission | null {
  const escalationReporting =
    asNonEmptyString(submission.escalationReporting) ??
    asNonEmptyString(submission.escalation_reporting) ??
    asNonEmptyString(submission.reportingCadence) ??
    asNonEmptyString(submission.reporting_cadence);

  const familyRaw =
    submission.familyCadences ??
    submission.family_cadences ??
    submission.cadences;
  const toolRaw =
    submission.toolCoverage ??
    submission.tool_coverage ??
    submission.tools;

  if (!escalationReporting || !Array.isArray(familyRaw) || !Array.isArray(toolRaw)) {
    return null;
  }

  const familyCadences = familyRaw
    .map(parseFamilyCadence)
    .filter((entry): entry is ConMonFamilyCadence => entry !== null);
  const toolCoverage = toolRaw
    .map(parseToolCoverage)
    .filter((entry): entry is ConMonToolCoverage => entry !== null);

  if (familyCadences.length === 0 || toolCoverage.length === 0) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'conmon_strategy',
    familyCadences,
    toolCoverage,
    escalationReporting,
  };
}

function formatFamilyCadences(rows: ConMonFamilyCadence[]): string {
  return rows
    .map(
      (row) =>
        `- ${row.family}: cadence=${row.cadence}; rationale=${row.rationale}`
    )
    .join('\n');
}

function formatToolCoverage(rows: ConMonToolCoverage[]): string {
  return rows
    .map(
      (row) =>
        `- ${row.tool}: families=${row.families.join(', ')}; rationale=${row.rationale}`
    )
    .join('\n');
}

function formatSystemProfile(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;
  const profile = initialState.systemProfile ?? initialState.system_profile;
  if (typeof profile === 'string' && profile.trim()) {
    return profile.trim();
  }
  if (!isPlainObject(profile)) return undefined;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(profile)) {
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    } else if (Array.isArray(value)) {
      const items = value.filter((entry) => typeof entry === 'string') as string[];
      if (items.length > 0) {
        parts.push(`${key}: ${items.join(', ')}`);
      }
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateConMonStrategyDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ConMonStrategySubmission | null;
  structured: ConMonStrategyStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseConMonStrategyExpectedState(ticket.expected_state);
  const requiredFamilies = (
    expected.requiredFamilies && expected.requiredFamilies.length > 0
      ? expected.requiredFamilies
      : [...DEFAULT_CONMON_CONTROL_FAMILIES]
  ).map(normalizeFamily);

  const requiredTools = (
    expected.requiredTools && expected.requiredTools.length > 0
      ? expected.requiredTools
      : [...CONMON_TOOLS]
  ).map(normalizeTool);

  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : CONMON_STRATEGY_MIN_FIELD_LENGTH;

  const minEscalationLength =
    typeof expected.minEscalationLength === 'number' &&
    Number.isFinite(expected.minEscalationLength) &&
    expected.minEscalationLength > 0
      ? Math.floor(expected.minEscalationLength)
      : CONMON_STRATEGY_MIN_ESCALATION_LENGTH;

  const parsed = extractConMonStrategySubmission(submission);

  if (!parsed) {
    const structured: ConMonStrategyStructuredResult = {
      style: 'conmon_strategy',
      familiesCovered: [],
      missingFamilies: requiredFamilies,
      toolsCovered: [],
      missingTools: requiredTools,
      escalationLength: 0,
      minEscalationLength,
      fieldLengthOk: false,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include familyCadences, toolCoverage (DefectDojo, CloudSploit, Scuba), and escalationReporting.',
    };
  }

  const familiesCovered = Array.from(
    new Set(parsed.familyCadences.map((row) => normalizeFamily(row.family)))
  );
  const missingFamilies = requiredFamilies.filter(
    (family) => !familiesCovered.includes(family)
  );

  const shortCadenceFields = parsed.familyCadences.filter(
    (row) =>
      row.cadence.length < minFieldLength || row.rationale.length < minFieldLength
  );

  const toolsCovered = Array.from(
    new Set(parsed.toolCoverage.map((row) => normalizeTool(row.tool)))
  );
  const missingTools = requiredTools.filter(
    (tool) => !toolsCovered.includes(tool)
  );

  const shortToolFields = parsed.toolCoverage.filter(
    (row) => row.rationale.length < minFieldLength || row.families.length === 0
  );

  const escalationLength = parsed.escalationReporting.length;
  const escalationOk = escalationLength >= minEscalationLength;
  const fieldLengthOk =
    shortCadenceFields.length === 0 && shortToolFields.length === 0;

  const structured: ConMonStrategyStructuredResult = {
    style: 'conmon_strategy',
    familiesCovered,
    missingFamilies,
    toolsCovered,
    missingTools,
    escalationLength,
    minEscalationLength,
    fieldLengthOk,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (missingFamilies.length > 0) {
    structured.reason = 'missing_families';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Provide a monitoring cadence for each required control family. Missing: ${missingFamilies.join(', ')}.`,
    };
  }

  if (missingTools.length > 0) {
    structured.reason = 'missing_tools';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Map each required tool to one or more control families. Missing: ${missingTools.join(', ')}.`,
    };
  }

  if (!fieldLengthOk) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Expand cadence rationales and tool-coverage rationales to at least ${minFieldLength} characters each.`,
    };
  }

  if (!escalationOk) {
    structured.reason = 'escalation_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Escalation/reporting cadence must be at least ${minEscalationLength} characters. Include audiences, report frequency, and escalation triggers.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading ConMon strategy against SP 800-137 guidance…',
  };
}

async function gradeMemoWithSp800137(
  parsed: ConMonStrategySubmission,
  ticket: ScorableTicket,
  expected: ConMonStrategyExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    formatFamilyCadences(parsed.familyCadences),
    formatToolCoverage(parsed.toolCoverage),
    parsed.escalationReporting,
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveSp800137Guidance(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const prompt = buildConMonStrategyGradingPrompt(retrieved, {
    familyCadencesText: formatFamilyCadences(parsed.familyCadences),
    toolCoverageText: formatToolCoverage(parsed.toolCoverage),
    escalationReporting: parsed.escalationReporting,
    scenarioBrief: ticket.scenario_brief,
    systemProfileText: formatSystemProfile(ticket.initial_state),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const conmonStrategyTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateConMonStrategyDeterministic(
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

    const expected = parseConMonStrategyExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeMemoWithSp800137(
          deterministic.parsed,
          ticket,
          expected
        );

      const structured: ConMonStrategyStructuredResult = {
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
        const structured: ConMonStrategyStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Memo sections look complete, but AI grading against SP 800-137 is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('ConMon strategy SP 800-137 grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'conmon_strategy_sp800137_grade',
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
          'Could not grade your ConMon strategy against SP 800-137 guidance. Please try again shortly.',
      };
    }
  },
};
