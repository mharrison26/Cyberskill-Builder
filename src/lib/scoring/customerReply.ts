import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildCustomerReplyGradingPrompt } from '@/lib/grading/buildCustomerReplyGradingPrompt';
import {
  DEFAULT_CUSTOMER_REPLY_RUBRIC_SECTION_IDS,
  retrieveCustomerCommunicationRubric,
} from '@/lib/helpdesk/getCustomerCommunicationRubric';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { CUSTOMER_REPLY_MIN_REPLY_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Customer-reply / de-escalation ticket scoring.
 *
 * Deterministic:
 *   - reply present + meets minimum length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned customer-communication rubric text
 *   - grade reply against retrieved rubric only (anti-hallucination)
 */

export type CustomerReplyExpectedState = {
  minReplyLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type CustomerReplySubmission = {
  type?: string;
  reply: string;
};

export type CustomerReplyStructuredResult = {
  style: 'customer_reply';
  replyLength: number;
  minReplyLength: number;
  replyLengthOk: boolean;
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

export function parseCustomerReplyExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): CustomerReplyExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as CustomerReplyExpectedState;
}

export function extractCustomerReplySubmission(
  submission: TicketSubmission
): CustomerReplySubmission | null {
  const replyRaw =
    submission.reply ??
    submission.draftedReply ??
    submission.drafted_reply ??
    submission.response ??
    submission.body;

  if (typeof replyRaw !== 'string') {
    return null;
  }

  const reply = replyRaw.trim();
  if (!reply) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'customer_reply',
    reply,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (isPlainObject(value)) return value;
  return {};
}

export function extractCustomerEmailFromInitialState(
  initialState: Record<string, unknown> | null | undefined
): { subject: string | null; body: string | null; from: string | null } {
  const root = asRecord(initialState);
  const nested = asRecord(
    root.customerEmail ?? root.customer_email ?? root.email
  );

  const subject =
    typeof nested.subject === 'string' && nested.subject.trim()
      ? nested.subject.trim()
      : typeof root.subject === 'string' && root.subject.trim()
        ? root.subject.trim()
        : null;

  const body =
    typeof nested.body === 'string' && nested.body.trim()
      ? nested.body.trim()
      : typeof nested.text === 'string' && nested.text.trim()
        ? nested.text.trim()
        : typeof root.customerEmailBody === 'string' &&
            root.customerEmailBody.trim()
          ? root.customerEmailBody.trim()
          : null;

  const from =
    typeof nested.from === 'string' && nested.from.trim()
      ? nested.from.trim()
      : typeof nested.sender === 'string' && nested.sender.trim()
        ? nested.sender.trim()
        : null;

  return { subject, body, from };
}

export function evaluateCustomerReplyDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: CustomerReplySubmission | null;
  structured: CustomerReplyStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseCustomerReplyExpectedState(ticket.expected_state);
  const minLength =
    typeof expected.minReplyLength === 'number' &&
    Number.isFinite(expected.minReplyLength) &&
    expected.minReplyLength > 0
      ? Math.floor(expected.minReplyLength)
      : CUSTOMER_REPLY_MIN_REPLY_LENGTH;

  const parsed = extractCustomerReplySubmission(submission);

  if (!parsed) {
    const structured: CustomerReplyStructuredResult = {
      style: 'customer_reply',
      replyLength: 0,
      minReplyLength: minLength,
      replyLengthOk: false,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback: 'Submission must include a drafted reply (reply).',
    };
  }

  const replyLength = parsed.reply.length;
  const replyLengthOk = replyLength >= minLength;

  const structured: CustomerReplyStructuredResult = {
    style: 'customer_reply',
    replyLength,
    minReplyLength: minLength,
    replyLengthOk,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!replyLengthOk) {
    structured.reason = 'reply_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Drafted reply must be at least ${minLength} characters. Expand acknowledgment, next steps, and tone.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading reply against pinned customer-communication rubric…',
  };
}

async function gradeReplyWithCommunicationRubric(
  parsed: CustomerReplySubmission,
  ticket: ScorableTicket,
  expected: CustomerReplyExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : [...DEFAULT_CUSTOMER_REPLY_RUBRIC_SECTION_IDS];

  const retrieved = retrieveCustomerCommunicationRubric(parsed.reply, {
    topK: expected.topKGuidanceSections ?? 4,
    requiredSectionIds,
  });

  const customerEmail = extractCustomerEmailFromInitialState(
    ticket.initial_state as Record<string, unknown>
  );

  const prompt = buildCustomerReplyGradingPrompt(retrieved, {
    reply: parsed.reply,
    customerEmailBody: customerEmail.body ?? undefined,
    customerEmailSubject: customerEmail.subject ?? undefined,
    scenarioBrief: ticket.scenario_brief,
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const customerReplyTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateCustomerReplyDeterministic(
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

    const expected = parseCustomerReplyExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeReplyWithCommunicationRubric(
          deterministic.parsed,
          ticket,
          expected
        );

      const structured: CustomerReplyStructuredResult = {
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
        const structured: CustomerReplyStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Reply length looks good, but AI grading against the pinned customer-communication rubric is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Customer-reply rubric grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'customer_reply_rubric_grade',
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
          'Could not grade your reply against the customer-communication rubric. Please try again shortly.',
      };
    }
  },
};
