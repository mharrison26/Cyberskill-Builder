import { buildCmmcGapAnalysisGradingPrompt } from '@/lib/grading/buildCmmcGapAnalysisGradingPrompt';
import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import {
  getCmmcPractice,
  listCmmcPractices,
  retrieveCmmcPractices,
} from '@/lib/cmmc/getCmmcPractices';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * CMMC 2.0 Level 2 gap-analysis ticket scoring.
 *
 * Deterministic:
 *   - every in-scope practice scored (met / partial / not_met)
 *   - readiness % present (0–100)
 *   - when expected_state.expectedPracticeScores is set: classifications
 *     must match the answer key and readiness % must equal
 *     calculateCmmcReadinessPercent (or expectedReadinessPercent)
 *   - gap analysis meets minimum length
 *
 * Readiness formula (default, overridable via expected_state weights):
 *   readinessPercent = round(100 * Σ weight(score_i) / N)
 *   weight(met)=1, weight(partial)=0.5, weight(not_met)=0
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned CMMC practice descriptions
 *   - grade gap analysis against retrieved text only
 */

export {
  CMMC_GAP_ANALYSIS_MIN_LENGTH,
  CMMC_PRACTICE_SCORE_VALUES,
  type CmmcPracticeScoreValue,
} from '@/lib/scoring/ticketUi';
import {
  CMMC_GAP_ANALYSIS_MIN_LENGTH,
  CMMC_PRACTICE_SCORE_VALUES,
  type CmmcPracticeScoreValue,
} from '@/lib/scoring/ticketUi';

/** Default weights for readiness %: met=1, partial=0.5, not_met=0. */
export const DEFAULT_CMMC_READINESS_WEIGHTS: Record<
  CmmcPracticeScoreValue,
  number
> = {
  met: 1,
  partial: 0.5,
  not_met: 0,
};

export type CmmcGapAnalysisExpectedState = {
  minGapAnalysisLength?: number;
  topKPractices?: number;
  /** Optional override; defaults to initial_state.practiceIds. */
  practiceIds?: string[];
  /** Answer-key classifications (GRC-07 deliberate mix). */
  expectedPracticeScores?: CmmcPracticeScoreEntry[];
  /** Expected readiness % derived from the answer-key mix. */
  expectedReadinessPercent?: number;
  /**
   * Optional weight override. Defaults: met=1, partial=0.5, not_met=0.
   * Formula: round(100 * Σ weight(score) / N).
   */
  readinessWeights?: Partial<Record<CmmcPracticeScoreValue, number>>;
  readinessFormula?: string;
};

export type CmmcGapAnalysisInitialState = {
  companyName?: string;
  companySummary?: string;
  implementationSummary?: string;
  practiceIds?: string[];
  readinessFormula?: string;
};

export type CmmcPracticeScoreEntry = {
  practiceId: string;
  score: CmmcPracticeScoreValue;
};

export type CmmcGapAnalysisSubmission = {
  type?: string;
  practiceScores: CmmcPracticeScoreEntry[];
  gapAnalysis: string;
  readinessPercent: number;
};

export type CmmcGapAnalysisStructuredResult = {
  style: 'cmmc_gap_analysis';
  practiceIds: string[];
  scoredPracticeIds: string[];
  missingPracticeIds: string[];
  invalidScores: string[];
  mismatchedPracticeIds: string[];
  readinessPercent: number | null;
  expectedReadinessPercent: number | null;
  calculatedReadinessPercent: number | null;
  readinessPercentOk: boolean;
  practiceScoresMatchExpected: boolean | null;
  gapAnalysisLength: number;
  minGapAnalysisLength: number;
  gapAnalysisLengthOk: boolean;
  catalogPath: string | null;
  retrievedPracticeIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

/**
 * Calculate checkable readiness % from practice scores.
 *
 * Formula: round(100 * Σ weight(score_i) / N)
 * Default weights: met=1, partial=0.5, not_met=0
 */
export function calculateCmmcReadinessPercent(
  scores: Array<{ score: CmmcPracticeScoreValue }>,
  weights: Partial<Record<CmmcPracticeScoreValue, number>> = DEFAULT_CMMC_READINESS_WEIGHTS
): number {
  if (scores.length === 0) {
    return 0;
  }
  const resolved = {
    ...DEFAULT_CMMC_READINESS_WEIGHTS,
    ...weights,
  };
  const total = scores.reduce((sum, entry) => sum + resolved[entry.score], 0);
  return Math.round((100 * total) / scores.length);
}

export function parseExpectedPracticeScores(
  expected: CmmcGapAnalysisExpectedState
): CmmcPracticeScoreEntry[] {
  if (!Array.isArray(expected.expectedPracticeScores)) {
    return [];
  }
  const out: CmmcPracticeScoreEntry[] = [];
  for (const entry of expected.expectedPracticeScores) {
    if (!isPlainObject(entry)) continue;
    const practiceIdRaw =
      entry.practiceId ??
      (entry as { practice_id?: unknown }).practice_id ??
      (entry as { id?: unknown }).id;
    const scoreRaw =
      entry.score ??
      (entry as { status?: unknown }).status ??
      (entry as { value?: unknown }).value;
    if (typeof practiceIdRaw !== 'string' || !practiceIdRaw.trim()) continue;
    if (!isPracticeScoreValue(scoreRaw)) continue;
    out.push({ practiceId: practiceIdRaw.trim(), score: scoreRaw });
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPracticeScoreValue(value: unknown): value is CmmcPracticeScoreValue {
  return (
    typeof value === 'string' &&
    (CMMC_PRACTICE_SCORE_VALUES as readonly string[]).includes(value)
  );
}

export function parseCmmcGapAnalysisExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): CmmcGapAnalysisExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as CmmcGapAnalysisExpectedState;
}

export function parseCmmcGapAnalysisInitialState(
  initialState: Record<string, unknown> | null | undefined
): CmmcGapAnalysisInitialState {
  if (!isPlainObject(initialState)) {
    return {};
  }
  return initialState as CmmcGapAnalysisInitialState;
}

export function resolveCmmcPracticeIds(ticket: ScorableTicket): string[] {
  const expected = parseCmmcGapAnalysisExpectedState(ticket.expected_state);
  const initial = parseCmmcGapAnalysisInitialState(ticket.initial_state);

  const fromExpected = Array.isArray(expected.practiceIds)
    ? expected.practiceIds.filter((id): id is string => typeof id === 'string')
    : [];
  const fromInitial = Array.isArray(initial.practiceIds)
    ? initial.practiceIds.filter((id): id is string => typeof id === 'string')
    : [];

  const selected = (fromExpected.length > 0 ? fromExpected : fromInitial)
    .map((id) => id.trim())
    .filter(Boolean);

  if (selected.length > 0) {
    return selected;
  }

  // Fallback: entire pinned subset (lab default).
  return listCmmcPractices().map((practice) => practice.id);
}

export function extractCmmcGapAnalysisSubmission(
  submission: TicketSubmission
): CmmcGapAnalysisSubmission | null {
  const gapRaw =
    submission.gapAnalysis ??
    submission.gap_analysis ??
    submission.narrative ??
    submission.gaps;

  const readinessRaw =
    submission.readinessPercent ??
    submission.readiness_percent ??
    submission.readiness;

  const scoresRaw =
    submission.practiceScores ??
    submission.practice_scores ??
    submission.scores;

  if (typeof gapRaw !== 'string') {
    return null;
  }

  let readinessPercent: number | null = null;
  if (typeof readinessRaw === 'number' && Number.isFinite(readinessRaw)) {
    readinessPercent = readinessRaw;
  } else if (typeof readinessRaw === 'string' && readinessRaw.trim()) {
    const parsed = Number(readinessRaw.trim().replace(/%$/, ''));
    if (Number.isFinite(parsed)) {
      readinessPercent = parsed;
    }
  }

  if (readinessPercent === null) {
    return null;
  }

  if (!Array.isArray(scoresRaw)) {
    return null;
  }

  const practiceScores: CmmcPracticeScoreEntry[] = [];
  for (const entry of scoresRaw) {
    if (!isPlainObject(entry)) continue;
    const practiceIdRaw = entry.practiceId ?? entry.practice_id ?? entry.id;
    const scoreRaw = entry.score ?? entry.status ?? entry.value;
    if (typeof practiceIdRaw !== 'string' || !practiceIdRaw.trim()) continue;
    if (!isPracticeScoreValue(scoreRaw)) continue;
    practiceScores.push({
      practiceId: practiceIdRaw.trim(),
      score: scoreRaw,
    });
  }

  if (practiceScores.length === 0) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'cmmc_gap_analysis',
    practiceScores,
    gapAnalysis: gapRaw.trim(),
    readinessPercent,
  };
}

export function evaluateCmmcGapAnalysisDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: CmmcGapAnalysisSubmission | null;
  structured: CmmcGapAnalysisStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseCmmcGapAnalysisExpectedState(ticket.expected_state);
  const practiceIds = resolveCmmcPracticeIds(ticket);
  const minLength =
    typeof expected.minGapAnalysisLength === 'number' &&
    Number.isFinite(expected.minGapAnalysisLength) &&
    expected.minGapAnalysisLength > 0
      ? Math.floor(expected.minGapAnalysisLength)
      : CMMC_GAP_ANALYSIS_MIN_LENGTH;

  const parsed = extractCmmcGapAnalysisSubmission(submission);

  const expectedScores = parseExpectedPracticeScores(expected);
  const hasAnswerKey = expectedScores.length > 0;
  const readinessWeights = expected.readinessWeights;
  const expectedReadinessFromKey =
    typeof expected.expectedReadinessPercent === 'number' &&
    Number.isFinite(expected.expectedReadinessPercent)
      ? Math.round(expected.expectedReadinessPercent)
      : hasAnswerKey
        ? calculateCmmcReadinessPercent(expectedScores, readinessWeights)
        : null;

  if (!parsed) {
    const structured: CmmcGapAnalysisStructuredResult = {
      style: 'cmmc_gap_analysis',
      practiceIds,
      scoredPracticeIds: [],
      missingPracticeIds: practiceIds,
      invalidScores: [],
      mismatchedPracticeIds: [],
      readinessPercent: null,
      expectedReadinessPercent: expectedReadinessFromKey,
      calculatedReadinessPercent: null,
      readinessPercentOk: false,
      practiceScoresMatchExpected: hasAnswerKey ? false : null,
      gapAnalysisLength: 0,
      minGapAnalysisLength: minLength,
      gapAnalysisLengthOk: false,
      catalogPath: null,
      retrievedPracticeIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include practiceScores (met/partial/not_met), gapAnalysis, and readinessPercent (0–100).',
    };
  }

  const scoreById = new Map(
    parsed.practiceScores.map((entry) => [
      entry.practiceId.toLowerCase(),
      entry,
    ])
  );

  const missingPracticeIds = practiceIds.filter(
    (id) => !scoreById.has(id.toLowerCase())
  );
  const invalidScores: string[] = [];
  for (const entry of parsed.practiceScores) {
    if (!isPracticeScoreValue(entry.score)) {
      invalidScores.push(entry.practiceId);
    }
  }

  const orderedScores = practiceIds
    .map((id) => scoreById.get(id.toLowerCase()))
    .filter((entry): entry is CmmcPracticeScoreEntry => Boolean(entry));

  const calculatedReadinessPercent =
    orderedScores.length > 0
      ? calculateCmmcReadinessPercent(orderedScores, readinessWeights)
      : null;

  const readinessInRange =
    Number.isFinite(parsed.readinessPercent) &&
    parsed.readinessPercent >= 0 &&
    parsed.readinessPercent <= 100;

  const mismatchedPracticeIds: string[] = [];
  if (hasAnswerKey) {
    const expectedById = new Map(
      expectedScores.map((entry) => [entry.practiceId.toLowerCase(), entry.score])
    );
    for (const id of practiceIds) {
      const submitted = scoreById.get(id.toLowerCase());
      const expectedScore = expectedById.get(id.toLowerCase());
      if (!submitted || !expectedScore) continue;
      if (submitted.score !== expectedScore) {
        mismatchedPracticeIds.push(id);
      }
    }
    // Also flag answer-key practices missing from ticket practiceIds (config drift).
    for (const entry of expectedScores) {
      if (
        !practiceIds.some(
          (id) => id.toLowerCase() === entry.practiceId.toLowerCase()
        )
      ) {
        mismatchedPracticeIds.push(entry.practiceId);
      }
    }
  }

  const practiceScoresMatchExpected = hasAnswerKey
    ? mismatchedPracticeIds.length === 0 && missingPracticeIds.length === 0
    : null;

  const readinessPercentOk = hasAnswerKey
    ? readinessInRange &&
      expectedReadinessFromKey !== null &&
      Math.round(parsed.readinessPercent) === expectedReadinessFromKey &&
      calculatedReadinessPercent === expectedReadinessFromKey
    : readinessInRange;

  const gapAnalysisLength = parsed.gapAnalysis.length;
  const gapAnalysisLengthOk = gapAnalysisLength >= minLength;

  const structured: CmmcGapAnalysisStructuredResult = {
    style: 'cmmc_gap_analysis',
    practiceIds,
    scoredPracticeIds: parsed.practiceScores.map((entry) => entry.practiceId),
    missingPracticeIds,
    invalidScores,
    mismatchedPracticeIds,
    readinessPercent: parsed.readinessPercent,
    expectedReadinessPercent: expectedReadinessFromKey,
    calculatedReadinessPercent,
    readinessPercentOk,
    practiceScoresMatchExpected,
    gapAnalysisLength,
    minGapAnalysisLength: minLength,
    gapAnalysisLengthOk,
    catalogPath: null,
    retrievedPracticeIds: [],
  };

  if (missingPracticeIds.length > 0) {
    structured.reason = 'incomplete_practice_scores';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Score every in-scope practice. Missing: ${missingPracticeIds.join(', ')}.`,
    };
  }

  if (!readinessInRange) {
    structured.reason = 'invalid_readiness_percent';
    return {
      parsed,
      structured,
      ok: false,
      feedback: 'Overall readiness percentage must be a number from 0 to 100.',
    };
  }

  if (hasAnswerKey && mismatchedPracticeIds.length > 0) {
    structured.reason = 'practice_scores_mismatch';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Practice classifications do not match the implementation evidence. Revisit: ${mismatchedPracticeIds.join(', ')}.`,
    };
  }

  if (hasAnswerKey && !readinessPercentOk) {
    structured.reason = 'readiness_percent_mismatch';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        expectedReadinessFromKey !== null
          ? `Overall readiness must equal ${expectedReadinessFromKey}% using readinessPercent = round(100 × Σ weight(score) / N) with met=1, partial=0.5, not_met=0. Your submitted value (${Math.round(parsed.readinessPercent)}%) does not match the designed practice mix.`
          : 'Overall readiness percentage does not match the designed practice mix.',
    };
  }

  if (!gapAnalysisLengthOk) {
    structured.reason = 'gap_analysis_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Gap analysis must be at least ${minLength} characters. Explain gaps against the CMMC practices you scored.`,
    };
  }

  // Validate practice IDs exist in pinned corpus (typos → revision).
  const unknownIds: string[] = [];
  for (const id of practiceIds) {
    try {
      getCmmcPractice(id);
    } catch {
      unknownIds.push(id);
    }
  }
  if (unknownIds.length > 0) {
    structured.reason = 'unknown_practice_ids';
    structured.invalidScores = unknownIds;
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Ticket references unknown CMMC practice IDs: ${unknownIds.join(', ')}. Ask an admin to fix the ticket configuration.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: hasAnswerKey
      ? 'Practice scores and readiness % match the answer key. Grading gap analysis against pinned CMMC practice descriptions…'
      : 'Deterministic checks passed. Grading gap analysis against pinned CMMC practice descriptions…',
  };
}

async function gradeGapAnalysisWithCmmc(
  parsed: CmmcGapAnalysisSubmission,
  ticket: ScorableTicket,
  practiceIds: string[],
  expected: CmmcGapAnalysisExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedPracticeIds: string[];
  catalogPath: string;
}> {
  const initial = parseCmmcGapAnalysisInitialState(ticket.initial_state);

  const retrieved = retrieveCmmcPractices(parsed.gapAnalysis, {
    topK: expected.topKPractices ?? Math.max(practiceIds.length, 8),
    requiredPracticeIds: practiceIds,
  });

  const prompt = buildCmmcGapAnalysisGradingPrompt(retrieved, {
    practiceScores: parsed.practiceScores,
    gapAnalysis: parsed.gapAnalysis,
    readinessPercent: parsed.readinessPercent,
    companyName: initial.companyName,
    scenarioBrief: ticket.scenario_brief,
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedPracticeIds: retrieved.practices.map((practice) => practice.id),
    catalogPath: retrieved.catalogPath,
  };
}

export const cmmcGapAnalysisTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateCmmcGapAnalysisDeterministic(
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

    const expected = parseCmmcGapAnalysisExpectedState(ticket.expected_state);
    const practiceIds = resolveCmmcPracticeIds(ticket);

    try {
      const { grading, retrievedPracticeIds, catalogPath } =
        await gradeGapAnalysisWithCmmc(
          deterministic.parsed,
          ticket,
          practiceIds,
          expected
        );

      const structured: CmmcGapAnalysisStructuredResult = {
        ...deterministic.structured,
        catalogPath,
        retrievedPracticeIds,
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
        const structured: CmmcGapAnalysisStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Practice scores, readiness %, and gap analysis length look good, but AI grading against pinned CMMC practices is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('CMMC gap-analysis grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'cmmc_gap_analysis_grade',
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
          'Could not grade your gap analysis against CMMC practice descriptions. Please try again shortly.',
      };
    }
  },
};
