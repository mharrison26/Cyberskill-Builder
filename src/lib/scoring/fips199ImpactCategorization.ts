import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildFips199GradingPrompt } from '@/lib/grading/buildFips199GradingPrompt';
import {
  retrieveFips199Guidance,
  type RetrievedFips199Guidance,
} from '@/lib/nist/getFips199Guidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * FIPS 199 impact categorization scoring.
 *
 * Deterministic:
 *   - confidentiality / integrity / availability / overall match expected_state
 *   - overall equals high-water mark of C/I/A (when overall is seeded)
 *   - justification meets minimum length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned FIPS 199 educational excerpts
 *   - grade justification against retrieved text only
 */

export {
  FIPS_199_IMPACT_LEVELS,
  FIPS_199_IMPACT_LEVEL_LABELS,
  FIPS_199_MIN_JUSTIFICATION_LENGTH,
  FIPS_199_SECURITY_OBJECTIVES,
  FIPS_199_SECURITY_OBJECTIVE_LABELS,
  isFips199ImpactCategorizationTicketType,
  isFips199ImpactLevel,
  type Fips199ImpactLevel,
  type Fips199SecurityObjective,
} from '@/lib/scoring/ticketUi';
import {
  FIPS_199_MIN_JUSTIFICATION_LENGTH,
  isFips199ImpactLevel,
  type Fips199ImpactLevel,
} from '@/lib/scoring/ticketUi';

export const FIPS_199_TICKET_TYPES = [
  'fips_199_impact_categorization',
  'impact_categorization',
  'security_categorization',
] as const;

export type Fips199ExpectedState = {
  confidentiality?: Fips199ImpactLevel;
  integrity?: Fips199ImpactLevel;
  availability?: Fips199ImpactLevel;
  overall?: Fips199ImpactLevel;
  minJustificationLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type Fips199Submission = {
  type?: string;
  confidentiality: Fips199ImpactLevel;
  integrity: Fips199ImpactLevel;
  availability: Fips199ImpactLevel;
  overall: Fips199ImpactLevel;
  justification: string;
};

export type Fips199StructuredResult = {
  style: 'fips_199_impact_categorization';
  confidentiality: Fips199ImpactLevel | null;
  integrity: Fips199ImpactLevel | null;
  availability: Fips199ImpactLevel | null;
  overall: Fips199ImpactLevel | null;
  expectedConfidentiality: Fips199ImpactLevel | null;
  expectedIntegrity: Fips199ImpactLevel | null;
  expectedAvailability: Fips199ImpactLevel | null;
  expectedOverall: Fips199ImpactLevel | null;
  levelsMatch: boolean;
  mismatchedObjectives: string[];
  highWaterMark: Fips199ImpactLevel | null;
  overallMatchesHighWaterMark: boolean;
  justificationLength: number;
  minJustificationLength: number;
  justificationLengthOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

const IMPACT_RANK: Record<Fips199ImpactLevel, number> = {
  low: 1,
  moderate: 2,
  high: 3,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeFips199ImpactLevel(
  value: unknown
): Fips199ImpactLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'med' || normalized === 'medium') {
    return 'moderate';
  }
  if (normalized.startsWith('fips_199_')) {
    const stripped = normalized.slice('fips_199_'.length);
    if (isFips199ImpactLevel(stripped)) return stripped;
  }
  if (isFips199ImpactLevel(normalized)) {
    return normalized;
  }
  return null;
}

export function highWaterMark(
  confidentiality: Fips199ImpactLevel,
  integrity: Fips199ImpactLevel,
  availability: Fips199ImpactLevel
): Fips199ImpactLevel {
  const levels = [confidentiality, integrity, availability];
  return levels.reduce((max, level) =>
    IMPACT_RANK[level] > IMPACT_RANK[max] ? level : max
  );
}

export function parseFips199ExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): Fips199ExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const confidentiality = normalizeFips199ImpactLevel(
    expectedState.confidentiality ??
      expectedState.expectedConfidentiality ??
      expectedState.c
  );
  const integrity = normalizeFips199ImpactLevel(
    expectedState.integrity ??
      expectedState.expectedIntegrity ??
      expectedState.i
  );
  const availability = normalizeFips199ImpactLevel(
    expectedState.availability ??
      expectedState.expectedAvailability ??
      expectedState.a
  );
  const overall = normalizeFips199ImpactLevel(
    expectedState.overall ??
      expectedState.expectedOverall ??
      expectedState.systemCategory ??
      expectedState.highWaterMark
  );

  const minJustificationLength =
    typeof expectedState.minJustificationLength === 'number' &&
    Number.isFinite(expectedState.minJustificationLength) &&
    expectedState.minJustificationLength > 0
      ? Math.floor(expectedState.minJustificationLength)
      : undefined;

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

  return {
    confidentiality: confidentiality ?? undefined,
    integrity: integrity ?? undefined,
    availability: availability ?? undefined,
    overall: overall ?? undefined,
    minJustificationLength,
    guidanceTopics,
    topKGuidanceSections,
  };
}

export function extractFips199Submission(
  submission: TicketSubmission
): Fips199Submission | null {
  const confidentiality = normalizeFips199ImpactLevel(
    submission.confidentiality ?? submission.c
  );
  const integrity = normalizeFips199ImpactLevel(
    submission.integrity ?? submission.i
  );
  const availability = normalizeFips199ImpactLevel(
    submission.availability ?? submission.a
  );
  const overall = normalizeFips199ImpactLevel(
    submission.overall ??
      submission.systemCategory ??
      submission.highWaterMark ??
      submission.high_water_mark
  );

  const justificationRaw =
    submission.justification ??
    submission.rationale ??
    submission.reason ??
    submission.categorizationRationale;

  if (
    !confidentiality ||
    !integrity ||
    !availability ||
    !overall ||
    typeof justificationRaw !== 'string'
  ) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'fips_199_impact_categorization',
    confidentiality,
    integrity,
    availability,
    overall,
    justification: justificationRaw.trim(),
  };
}

function systemProfileTextFromTicket(
  ticket: ScorableTicket
): string | undefined {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial)) return undefined;

  const nested = isPlainObject(initial.systemProfile)
    ? initial.systemProfile
    : isPlainObject(initial.system)
      ? initial.system
      : null;

  if (!nested) {
    if (typeof initial.systemProfileText === 'string') {
      return initial.systemProfileText.trim() || undefined;
    }
    return undefined;
  }

  const parts: string[] = [];
  for (const key of [
    'name',
    'description',
    'mission',
    'environment',
    'missionImpact',
    'fallbackNotes',
  ] as const) {
    const value = nested[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }

  const dataTypes = nested.dataTypes ?? nested.informationTypes;
  if (Array.isArray(dataTypes)) {
    const types = dataTypes
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (isPlainObject(item)) {
          const name =
            typeof item.name === 'string'
              ? item.name.trim()
              : typeof item.type === 'string'
                ? item.type.trim()
                : '';
          const notes =
            typeof item.notes === 'string'
              ? item.notes.trim()
              : typeof item.description === 'string'
                ? item.description.trim()
                : '';
          if (name && notes) return `${name} — ${notes}`;
          return name || notes;
        }
        return '';
      })
      .filter(Boolean);
    if (types.length > 0) {
      parts.push(`dataTypes: ${types.join('; ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateFips199Deterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: Fips199Submission | null;
  structured: Fips199StructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseFips199ExpectedState(ticket.expected_state);
  const minLength =
    expected.minJustificationLength ?? FIPS_199_MIN_JUSTIFICATION_LENGTH;
  const expectedConfidentiality = expected.confidentiality ?? null;
  const expectedIntegrity = expected.integrity ?? null;
  const expectedAvailability = expected.availability ?? null;
  const expectedOverall = expected.overall ?? null;
  const parsed = extractFips199Submission(submission);

  const baseStructured: Fips199StructuredResult = {
    style: 'fips_199_impact_categorization',
    confidentiality: parsed?.confidentiality ?? null,
    integrity: parsed?.integrity ?? null,
    availability: parsed?.availability ?? null,
    overall: parsed?.overall ?? null,
    expectedConfidentiality,
    expectedIntegrity,
    expectedAvailability,
    expectedOverall,
    levelsMatch: false,
    mismatchedObjectives: [],
    highWaterMark: parsed
      ? highWaterMark(
          parsed.confidentiality,
          parsed.integrity,
          parsed.availability
        )
      : null,
    overallMatchesHighWaterMark: false,
    justificationLength: parsed?.justification.length ?? 0,
    minJustificationLength: minLength,
    justificationLengthOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (
    !expectedConfidentiality ||
    !expectedIntegrity ||
    !expectedAvailability ||
    !expectedOverall
  ) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This FIPS 199 ticket is missing confidentiality, integrity, availability, or overall in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include confidentiality, integrity, availability, overall, and justification.',
    };
  }

  const mismatchedObjectives: string[] = [];
  if (parsed.confidentiality !== expectedConfidentiality) {
    mismatchedObjectives.push('confidentiality');
  }
  if (parsed.integrity !== expectedIntegrity) {
    mismatchedObjectives.push('integrity');
  }
  if (parsed.availability !== expectedAvailability) {
    mismatchedObjectives.push('availability');
  }
  if (parsed.overall !== expectedOverall) {
    mismatchedObjectives.push('overall');
  }

  const computedHighWater = highWaterMark(
    parsed.confidentiality,
    parsed.integrity,
    parsed.availability
  );
  const overallMatchesHighWaterMark = parsed.overall === computedHighWater;
  const justificationLength = parsed.justification.length;
  const justificationLengthOk = justificationLength >= minLength;
  const levelsMatch = mismatchedObjectives.length === 0;

  const structured: Fips199StructuredResult = {
    ...baseStructured,
    confidentiality: parsed.confidentiality,
    integrity: parsed.integrity,
    availability: parsed.availability,
    overall: parsed.overall,
    levelsMatch,
    mismatchedObjectives,
    highWaterMark: computedHighWater,
    overallMatchesHighWaterMark,
    justificationLength,
    justificationLengthOk,
  };

  if (!levelsMatch) {
    structured.reason = 'incorrect_levels';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Impact levels do not match the seeded FIPS 199 answer key (mismatch: ${mismatchedObjectives.join(', ')}). Re-read the information types and mission consequences, apply Low/Moderate/High potential-impact definitions, and set overall to the high-water mark of C/I/A.`,
    };
  }

  if (!overallMatchesHighWaterMark) {
    // Defensive: answer key should already enforce this; surface if seed is inconsistent.
    structured.reason = 'overall_not_high_water_mark';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Overall must equal the high-water mark of confidentiality, integrity, and availability (expected "${computedHighWater}" from your C/I/A selections).`,
    };
  }

  if (!justificationLengthOk) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Justification must be at least ${minLength} characters. Tie each C/I/A level to scenario data types and adverse-effect severity, and explain the high-water mark for overall.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading justification against pinned FIPS 199 guidance…',
  };
}

async function gradeJustificationWithGuidance(
  parsed: Fips199Submission,
  ticket: ScorableTicket,
  expected: Fips199ExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrieved: RetrievedFips199Guidance;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const query = [
    parsed.confidentiality,
    parsed.integrity,
    parsed.availability,
    parsed.overall,
    parsed.justification,
  ].join('\n');

  const retrieved = retrieveFips199Guidance(query, {
    topK: expected.topKGuidanceSections,
    requiredSectionIds,
  });

  const prompt = buildFips199GradingPrompt(retrieved, {
    confidentiality: parsed.confidentiality,
    integrity: parsed.integrity,
    availability: parsed.availability,
    overall: parsed.overall,
    justification: parsed.justification,
    scenarioBrief: ticket.scenario_brief,
    systemProfileText: systemProfileTextFromTicket(ticket),
  });

  const grading = await callClaudeGrading(prompt);
  return { grading, retrieved };
}

export const fips199ImpactCategorizationTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateFips199Deterministic(submission, ticket);

    if (!deterministic.ok || !deterministic.parsed) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parseFips199ExpectedState(ticket.expected_state);

    try {
      const { grading, retrieved } = await gradeJustificationWithGuidance(
        deterministic.parsed,
        ticket,
        expected
      );

      const structured: Fips199StructuredResult = {
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
        const structured: Fips199StructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Impact levels and justification length look good, but AI grading against the pinned FIPS 199 guidance is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('FIPS 199 impact categorization grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'fips_199_impact_categorization_grade',
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
          'Could not grade your justification against the pinned FIPS 199 guidance. Please try again shortly.',
      };
    }
  },
};
