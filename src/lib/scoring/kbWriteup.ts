import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildKbWriteupGradingPrompt } from '@/lib/grading/buildKbWriteupGradingPrompt';
import { retrieveKbQualityRubric } from '@/lib/kb/getKbQualityRubric';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { KB_WRITEUP_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Helpdesk post-resolution KB write-up scoring (HD-03; HD-02 legacy alias).
 *
 * Deterministic:
 *   - problem / rootCause / resolutionSteps / preventionTip present + min length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned KB-quality rubric (clarity, completeness, jargon explained)
 *   - grade write-up against retrieved rubric text only (writing quality, not compliance)
 */

export { KB_WRITEUP_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export type KbWriteupExpectedState = {
  minFieldLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type KbWriteupSubmission = {
  type?: string;
  problem: string;
  rootCause: string;
  resolutionSteps: string;
  preventionTip: string;
};

export type KbWriteupStructuredResult = {
  style: 'kb_writeup';
  problemLength: number;
  rootCauseLength: number;
  resolutionStepsLength: number;
  preventionTipLength: number;
  minFieldLength: number;
  fieldsOk: boolean;
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

export function parseKbWriteupExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): KbWriteupExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as KbWriteupExpectedState;
}

export function extractKbWriteupSubmission(
  submission: TicketSubmission
): KbWriteupSubmission | null {
  const problem = asNonEmptyString(submission.problem);
  const rootCause =
    asNonEmptyString(submission.rootCause) ??
    asNonEmptyString(submission.root_cause);
  const resolutionSteps =
    asNonEmptyString(submission.resolutionSteps) ??
    asNonEmptyString(submission.resolution_steps);
  const preventionTip =
    asNonEmptyString(submission.preventionTip) ??
    asNonEmptyString(submission.prevention_tip);

  if (!problem || !rootCause || !resolutionSteps || !preventionTip) {
    return null;
  }

  return {
    type: typeof submission.type === 'string' ? submission.type : 'kb_writeup',
    problem,
    rootCause,
    resolutionSteps,
    preventionTip,
  };
}

function formatTicketContext(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const parts: string[] = [];
  const orderedKeys = [
    'ticketCode',
    'ticket_code',
    'title',
    'requester',
    'category',
    'resolvedSummary',
    'resolved_summary',
    'symptoms',
    'environment',
    'prompt',
  ];

  for (const key of orderedKeys) {
    const value = initialState[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }

  const notes = initialState.resolutionNotes ?? initialState.resolution_notes;
  if (typeof notes === 'string' && notes.trim()) {
    parts.push(`resolutionNotes: ${notes.trim()}`);
  } else if (Array.isArray(notes)) {
    const items = notes.filter((entry) => typeof entry === 'string') as string[];
    if (items.length > 0) {
      parts.push(`resolutionNotes: ${items.join('; ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateKbWriteupDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: KbWriteupSubmission | null;
  structured: KbWriteupStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseKbWriteupExpectedState(ticket.expected_state);
  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : KB_WRITEUP_MIN_FIELD_LENGTH;

  const parsed = extractKbWriteupSubmission(submission);

  if (!parsed) {
    const structured: KbWriteupStructuredResult = {
      style: 'kb_writeup',
      problemLength: 0,
      rootCauseLength: 0,
      resolutionStepsLength: 0,
      preventionTipLength: 0,
      minFieldLength,
      fieldsOk: false,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include problem, rootCause, resolutionSteps, and preventionTip.',
    };
  }

  const lengths = {
    problemLength: parsed.problem.length,
    rootCauseLength: parsed.rootCause.length,
    resolutionStepsLength: parsed.resolutionSteps.length,
    preventionTipLength: parsed.preventionTip.length,
  };

  const shortFields = (
    [
      ['problem', lengths.problemLength],
      ['rootCause', lengths.rootCauseLength],
      ['resolutionSteps', lengths.resolutionStepsLength],
      ['preventionTip', lengths.preventionTipLength],
    ] as const
  )
    .filter(([, length]) => length < minFieldLength)
    .map(([name]) => name);

  const structured: KbWriteupStructuredResult = {
    style: 'kb_writeup',
    ...lengths,
    minFieldLength,
    fieldsOk: shortFields.length === 0,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (shortFields.length > 0) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Expand these KB fields (min ${minFieldLength} chars): ${shortFields.join(', ')}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading KB write-up against quality rubric…',
  };
}

async function gradeWriteupWithKbRubric(
  parsed: KbWriteupSubmission,
  ticket: ScorableTicket,
  expected: KbWriteupExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    parsed.problem,
    parsed.rootCause,
    parsed.resolutionSteps,
    parsed.preventionTip,
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveKbQualityRubric(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const prompt = buildKbWriteupGradingPrompt(retrieved, {
    problem: parsed.problem,
    rootCause: parsed.rootCause,
    resolutionSteps: parsed.resolutionSteps,
    preventionTip: parsed.preventionTip,
    scenarioBrief: ticket.scenario_brief,
    ticketContextText: formatTicketContext(ticket.initial_state),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const kbWriteupTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateKbWriteupDeterministic(submission, ticket);

    if (!deterministic.ok || !deterministic.parsed) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parseKbWriteupExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeWriteupWithKbRubric(deterministic.parsed, ticket, expected);

      const structured: KbWriteupStructuredResult = {
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
        const structured: KbWriteupStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'KB fields look complete, but AI grading against the writing-quality rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('KB write-up rubric grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'kb_writeup_rag_grade',
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
          'Could not grade your KB write-up against the quality rubric. Please try again shortly.',
      };
    }
  },
};
