import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildSecMaterialityGradingPrompt } from '@/lib/grading/buildSecMaterialityGradingPrompt';
import { captureFeatureException } from '@/lib/observability/sentry';
import {
  retrieveSecMaterialityGuidance,
  type RetrievedSecMaterialityGuidance,
} from '@/lib/sec/getSecMaterialityGuidance';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * SEC cybersecurity disclosure materiality memo scoring.
 *
 * Deterministic:
 *   - each required factor section present + non-empty (min length)
 *   - material / not_material determination + rationale present
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned SEC educational materiality summary
 *   - grade memo quality against retrieved text only
 */

export {
  SEC_MATERIALITY_MIN_FACTOR_LENGTH,
  SEC_MATERIALITY_MIN_RATIONALE_LENGTH,
  SEC_MATERIALITY_FACTOR_KEYS,
  SEC_MATERIALITY_FACTOR_LABELS,
  type SecMaterialityFactorKey,
  type SecMaterialityDetermination,
} from '@/lib/scoring/ticketUi';
import {
  SEC_MATERIALITY_MIN_FACTOR_LENGTH,
  SEC_MATERIALITY_MIN_RATIONALE_LENGTH,
  SEC_MATERIALITY_FACTOR_KEYS,
  type SecMaterialityDetermination,
} from '@/lib/scoring/ticketUi';

export type SecMaterialityExpectedState = {
  minFactorLength?: number;
  minRationaleLength?: number;
  requiredFactors?: string[];
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
  gradingFocus?: string;
  judgmentCall?: boolean;
};

export type SecMaterialitySubmission = {
  type?: string;
  determination: SecMaterialityDetermination;
  determinationRationale: string;
  factors: Record<string, string>;
};

export type SecMaterialityStructuredResult = {
  style: 'sec_materiality';
  determination: SecMaterialityDetermination | null;
  missingFactors: string[];
  shortFactors: string[];
  rationaleLength: number;
  minFactorLength: number;
  minRationaleLength: number;
  rationaleOk: boolean;
  determinationOk: boolean;
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

export function parseSecMaterialityExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SecMaterialityExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as SecMaterialityExpectedState;
}

export function resolveRequiredFactors(
  expected: SecMaterialityExpectedState
): string[] {
  if (
    Array.isArray(expected.requiredFactors) &&
    expected.requiredFactors.length > 0
  ) {
    return expected.requiredFactors
      .filter((key): key is string => typeof key === 'string')
      .map((key) => key.trim())
      .filter(Boolean);
  }
  return [...SEC_MATERIALITY_FACTOR_KEYS];
}

function normalizeDetermination(
  value: unknown
): SecMaterialityDetermination | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'material') return 'material';
  if (
    normalized === 'not_material' ||
    normalized === 'not-material' ||
    normalized === 'immaterial'
  ) {
    return 'not_material';
  }
  return null;
}

function extractFactors(
  submission: TicketSubmission
): Record<string, string> | null {
  const factorsRaw = submission.factors ?? submission.factorSections;
  if (!isPlainObject(factorsRaw)) {
    return null;
  }

  const factors: Record<string, string> = {};
  for (const [key, value] of Object.entries(factorsRaw)) {
    if (typeof value === 'string') {
      factors[key] = value.trim();
    }
  }
  return factors;
}

export function extractSecMaterialitySubmission(
  submission: TicketSubmission
): SecMaterialitySubmission | null {
  const determination = normalizeDetermination(
    submission.determination ?? submission.materialityDetermination
  );

  const rationaleRaw =
    submission.determinationRationale ??
    submission.determination_rationale ??
    submission.rationale ??
    submission.eightKRationale;

  const factors = extractFactors(submission);

  if (
    !determination ||
    typeof rationaleRaw !== 'string' ||
    !factors ||
    Object.keys(factors).length === 0
  ) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'sec_materiality',
    determination,
    determinationRationale: rationaleRaw.trim(),
    factors,
  };
}

function resolveMinLength(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

export function evaluateSecMaterialityDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: SecMaterialitySubmission | null;
  structured: SecMaterialityStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseSecMaterialityExpectedState(ticket.expected_state);
  const minFactorLength = resolveMinLength(
    expected.minFactorLength,
    SEC_MATERIALITY_MIN_FACTOR_LENGTH
  );
  const minRationaleLength = resolveMinLength(
    expected.minRationaleLength,
    SEC_MATERIALITY_MIN_RATIONALE_LENGTH
  );
  const requiredFactors = resolveRequiredFactors(expected);
  const parsed = extractSecMaterialitySubmission(submission);

  if (!parsed) {
    const structured: SecMaterialityStructuredResult = {
      style: 'sec_materiality',
      determination: null,
      missingFactors: requiredFactors,
      shortFactors: [],
      rationaleLength: 0,
      minFactorLength,
      minRationaleLength,
      rationaleOk: false,
      determinationOk: false,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include determination (material | not_material), determinationRationale, and a factors object covering each materiality factor.',
    };
  }

  const missingFactors = requiredFactors.filter(
    (key) => !parsed.factors[key] || !parsed.factors[key].trim()
  );
  const shortFactors = requiredFactors.filter((key) => {
    const text = parsed.factors[key]?.trim() ?? '';
    return text.length > 0 && text.length < minFactorLength;
  });
  const rationaleLength = parsed.determinationRationale.length;
  const rationaleOk = rationaleLength >= minRationaleLength;
  const determinationOk = parsed.determination !== null;

  const structured: SecMaterialityStructuredResult = {
    style: 'sec_materiality',
    determination: parsed.determination,
    missingFactors,
    shortFactors,
    rationaleLength,
    minFactorLength,
    minRationaleLength,
    rationaleOk,
    determinationOk,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (missingFactors.length > 0) {
    structured.reason = 'missing_factor_sections';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Memo is missing required materiality factor sections: ${missingFactors.join(', ')}.`,
    };
  }

  if (shortFactors.length > 0) {
    structured.reason = 'factor_sections_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Expand these factor sections (min ${minFactorLength} chars): ${shortFactors.join(', ')}.`,
    };
  }

  if (!rationaleOk) {
    structured.reason = 'rationale_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Determination / 8-K four-business-day rationale must be at least ${minRationaleLength} characters.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading memo against pinned SEC materiality guidance…',
  };
}

function buildMemoQuery(parsed: SecMaterialitySubmission): string {
  return [
    parsed.determination,
    parsed.determinationRationale,
    ...Object.values(parsed.factors),
  ].join('\n');
}

function formatBreachScenarioText(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const lines: string[] = [];
  const keyArtifact = initialState.keyArtifact;
  if (typeof keyArtifact === 'string' && keyArtifact.trim()) {
    lines.push(keyArtifact.trim());
  }

  const breach = isPlainObject(initialState.breach)
    ? initialState.breach
    : null;
  if (breach) {
    const fields: Array<[string, string]> = [
      ['Company', 'company'],
      ['Discovered', 'discoveredAt'],
      ['Systems affected', 'systemsAffected'],
      ['Data exposed', 'dataExposed'],
      ['Customers impacted', 'customersImpacted'],
      ['Vendor remediation', 'remediationStatus'],
      ['Business impact', 'businessImpact'],
      ['Scope', 'scopeNote'],
    ];
    for (const [label, key] of fields) {
      const value = breach[key];
      if (typeof value === 'string' && value.trim()) {
        lines.push(`${label}: ${value.trim()}`);
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

async function gradeMemoWithSecGuidance(
  parsed: SecMaterialitySubmission,
  ticket: ScorableTicket,
  expected: SecMaterialityExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrieved: RetrievedSecMaterialityGuidance;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveSecMaterialityGuidance(buildMemoQuery(parsed), {
    topK: expected.topKGuidanceSections,
    requiredSectionIds,
  });

  const prompt = buildSecMaterialityGradingPrompt(retrieved, {
    determination: parsed.determination,
    determinationRationale: parsed.determinationRationale,
    factorSections: parsed.factors,
    scenarioBrief: ticket.scenario_brief,
    breachScenarioText: formatBreachScenarioText(ticket.initial_state),
    gradingFocus:
      typeof expected.gradingFocus === 'string'
        ? expected.gradingFocus
        : undefined,
  });

  const grading = await callClaudeGrading(prompt);

  return { grading, retrieved };
}

export const secMaterialityTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateSecMaterialityDeterministic(
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

    const expected = parseSecMaterialityExpectedState(ticket.expected_state);

    try {
      const { grading, retrieved } = await gradeMemoWithSecGuidance(
        deterministic.parsed,
        ticket,
        expected
      );

      const structured: SecMaterialityStructuredResult = {
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
        const structured: SecMaterialityStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'All required factor sections look present, but AI grading against the pinned SEC materiality summary is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('SEC materiality grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'sec_materiality_grade',
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
          'Could not grade your memo against the pinned SEC materiality guidance. Please try again shortly.',
      };
    }
  },
};
