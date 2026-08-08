import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildCoachingFeedbackGradingPrompt } from '@/lib/grading/buildCoachingFeedbackGradingPrompt';
import {
  DEFAULT_COACHING_FEEDBACK_RUBRIC_SECTION_IDS,
  retrieveCoachingQualityRubric,
} from '@/lib/helpdesk/getCoachingQualityRubric';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { COACHING_FEEDBACK_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Peer / junior-notes coaching feedback scoring.
 *
 * Deterministic:
 *   - strengths / gaps / actionItems / delivery present + min length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned coaching-quality rubric (specific, actionable, respectful)
 *   - grade feedback against retrieved rubric text only (anti-hallucination)
 */

export { COACHING_FEEDBACK_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export type CoachingFeedbackExpectedState = {
  minFieldLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type CoachingFeedbackSubmission = {
  type?: string;
  strengths: string;
  gaps: string;
  actionItems: string;
  delivery: string;
};

export type CoachingFeedbackStructuredResult = {
  style: 'coaching_feedback';
  strengthsLength: number;
  gapsLength: number;
  actionItemsLength: number;
  deliveryLength: number;
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

export function parseCoachingFeedbackExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): CoachingFeedbackExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as CoachingFeedbackExpectedState;
}

export function extractCoachingFeedbackSubmission(
  submission: TicketSubmission
): CoachingFeedbackSubmission | null {
  const strengths = asNonEmptyString(submission.strengths);
  const gaps =
    asNonEmptyString(submission.gaps) ??
    asNonEmptyString(submission.improvementAreas) ??
    asNonEmptyString(submission.improvement_areas);
  const actionItems =
    asNonEmptyString(submission.actionItems) ??
    asNonEmptyString(submission.action_items) ??
    asNonEmptyString(submission.coachingPlan) ??
    asNonEmptyString(submission.coaching_plan);
  const delivery =
    asNonEmptyString(submission.delivery) ??
    asNonEmptyString(submission.deliveryNotes) ??
    asNonEmptyString(submission.delivery_notes) ??
    asNonEmptyString(submission.toneAndDelivery) ??
    asNonEmptyString(submission.tone_and_delivery);

  if (!strengths || !gaps || !actionItems || !delivery) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'coaching_feedback',
    strengths,
    gaps,
    actionItems,
    delivery,
  };
}

export function extractJuniorNotesFromInitialState(
  initialState: Record<string, unknown> | null | undefined
): string | null {
  if (!isPlainObject(initialState)) return null;

  const nested = isPlainObject(initialState.juniorNotes)
    ? initialState.juniorNotes
    : isPlainObject(initialState.junior_notes)
      ? initialState.junior_notes
      : null;

  const bodyCandidates = [
    nested && typeof nested.body === 'string' ? nested.body : null,
    nested && typeof nested.text === 'string' ? nested.text : null,
    nested && typeof nested.notes === 'string' ? nested.notes : null,
    typeof initialState.juniorNotes === 'string'
      ? initialState.juniorNotes
      : null,
    typeof initialState.junior_notes === 'string'
      ? initialState.junior_notes
      : null,
    typeof initialState.notes === 'string' ? initialState.notes : null,
    typeof initialState.ticketNotes === 'string'
      ? initialState.ticketNotes
      : null,
    typeof initialState.ticket_notes === 'string'
      ? initialState.ticket_notes
      : null,
  ];

  for (const candidate of bodyCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (Array.isArray(initialState.notes)) {
    const lines = initialState.notes
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (lines.length > 0) return lines.join('\n');
  }

  return null;
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
    'juniorTech',
    'junior_tech',
    'juniorName',
    'junior_name',
    'requester',
    'category',
    'prompt',
  ];

  for (const key of orderedKeys) {
    const value = initialState[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateCoachingFeedbackDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: CoachingFeedbackSubmission | null;
  structured: CoachingFeedbackStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseCoachingFeedbackExpectedState(ticket.expected_state);
  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : COACHING_FEEDBACK_MIN_FIELD_LENGTH;

  const parsed = extractCoachingFeedbackSubmission(submission);

  if (!parsed) {
    const structured: CoachingFeedbackStructuredResult = {
      style: 'coaching_feedback',
      strengthsLength: 0,
      gapsLength: 0,
      actionItemsLength: 0,
      deliveryLength: 0,
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
        'Submission must include strengths, gaps, actionItems, and delivery.',
    };
  }

  const lengths = {
    strengthsLength: parsed.strengths.length,
    gapsLength: parsed.gaps.length,
    actionItemsLength: parsed.actionItems.length,
    deliveryLength: parsed.delivery.length,
  };

  const shortFields = (
    [
      ['strengths', lengths.strengthsLength],
      ['gaps', lengths.gapsLength],
      ['actionItems', lengths.actionItemsLength],
      ['delivery', lengths.deliveryLength],
    ] as const
  )
    .filter(([, length]) => length < minFieldLength)
    .map(([name]) => name);

  const structured: CoachingFeedbackStructuredResult = {
    style: 'coaching_feedback',
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
      feedback: `Expand these coaching fields (min ${minFieldLength} chars): ${shortFields.join(', ')}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading coaching feedback against quality rubric…',
  };
}

async function gradeFeedbackWithCoachingRubric(
  parsed: CoachingFeedbackSubmission,
  ticket: ScorableTicket,
  expected: CoachingFeedbackExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    parsed.strengths,
    parsed.gaps,
    parsed.actionItems,
    parsed.delivery,
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : [...DEFAULT_COACHING_FEEDBACK_RUBRIC_SECTION_IDS];

  const retrieved = retrieveCoachingQualityRubric(query, {
    topK: expected.topKGuidanceSections ?? 5,
    requiredSectionIds,
  });

  const juniorNotes = extractJuniorNotesFromInitialState(
    ticket.initial_state as Record<string, unknown>
  );

  const prompt = buildCoachingFeedbackGradingPrompt(retrieved, {
    strengths: parsed.strengths,
    gaps: parsed.gaps,
    actionItems: parsed.actionItems,
    delivery: parsed.delivery,
    juniorNotes: juniorNotes ?? undefined,
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

export const coachingFeedbackTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateCoachingFeedbackDeterministic(
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

    const expected = parseCoachingFeedbackExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeFeedbackWithCoachingRubric(
          deterministic.parsed,
          ticket,
          expected
        );

      const structured: CoachingFeedbackStructuredResult = {
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
        const structured: CoachingFeedbackStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Coaching fields look complete, but AI grading against the pinned coaching-quality rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Coaching-feedback rubric grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'coaching_feedback_rag_grade',
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
          'Could not grade your coaching feedback against the quality rubric. Please try again shortly.',
      };
    }
  },
};
