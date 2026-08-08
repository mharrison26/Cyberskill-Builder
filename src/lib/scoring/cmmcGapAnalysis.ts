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
 *   - gap analysis meets minimum length
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

export type CmmcGapAnalysisExpectedState = {
  minGapAnalysisLength?: number;
  topKPractices?: number;
  /** Optional override; defaults to initial_state.practiceIds. */
  practiceIds?: string[];
};

export type CmmcGapAnalysisInitialState = {
  companyName?: string;
  companySummary?: string;
  implementationSummary?: string;
  practiceIds?: string[];
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
  readinessPercent: number | null;
  readinessPercentOk: boolean;
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

  if (!parsed) {
    const structured: CmmcGapAnalysisStructuredResult = {
      style: 'cmmc_gap_analysis',
      practiceIds,
      scoredPracticeIds: [],
      missingPracticeIds: practiceIds,
      invalidScores: [],
      readinessPercent: null,
      readinessPercentOk: false,
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

  const readinessPercentOk =
    Number.isFinite(parsed.readinessPercent) &&
    parsed.readinessPercent >= 0 &&
    parsed.readinessPercent <= 100;

  const gapAnalysisLength = parsed.gapAnalysis.length;
  const gapAnalysisLengthOk = gapAnalysisLength >= minLength;

  const structured: CmmcGapAnalysisStructuredResult = {
    style: 'cmmc_gap_analysis',
    practiceIds,
    scoredPracticeIds: parsed.practiceScores.map((entry) => entry.practiceId),
    missingPracticeIds,
    invalidScores,
    readinessPercent: parsed.readinessPercent,
    readinessPercentOk,
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

  if (!readinessPercentOk) {
    structured.reason = 'invalid_readiness_percent';
    return {
      parsed,
      structured,
      ok: false,
      feedback: 'Overall readiness percentage must be a number from 0 to 100.',
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
    feedback:
      'Deterministic checks passed. Grading gap analysis against pinned CMMC practice descriptions…',
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
