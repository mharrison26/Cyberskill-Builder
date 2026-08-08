import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildSlaEscalationGradingPrompt } from '@/lib/grading/buildSlaEscalationGradingPrompt';
import {
  retrieveSlaEscalationPolicy,
  type RetrievedSlaEscalationPolicy,
} from '@/lib/helpdesk/getSlaEscalationPolicy';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * SLA / escalate-or-resolve ticket scoring.
 *
 * Deterministic:
 *   - decision present and matches expected_state.expectedDecision
 *   - justification meets minimum length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned SLA/escalation policy text
 *   - grade justification against retrieved policy only
 */

export {
  SLA_ESCALATION_DECISIONS,
  SLA_ESCALATION_DECISION_LABELS,
  SLA_ESCALATION_MIN_JUSTIFICATION_LENGTH,
  isSlaEscalationDecision,
  isSlaEscalationTicketType,
  type SlaEscalationDecision,
} from '@/lib/scoring/ticketUi';
import {
  SLA_ESCALATION_MIN_JUSTIFICATION_LENGTH,
  isSlaEscalationDecision,
  type SlaEscalationDecision,
} from '@/lib/scoring/ticketUi';

export type SlaEscalationExpectedState = {
  /** Policy-derived answer key: escalate | resolve */
  expectedDecision?: SlaEscalationDecision;
  minJustificationLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type SlaEscalationSubmission = {
  type?: string;
  decision: SlaEscalationDecision;
  justification: string;
};

export type SlaEscalationStructuredResult = {
  style: 'sla_escalation';
  decision: SlaEscalationDecision | null;
  expectedDecision: SlaEscalationDecision | null;
  decisionMatch: boolean;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeDecision(value: unknown): SlaEscalationDecision | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'escalate' || normalized === 'escalation') {
    return 'escalate';
  }
  if (
    normalized === 'resolve' ||
    normalized === 'resolve_at_tier_1' ||
    normalized === 'tier1_resolve' ||
    normalized === 'close'
  ) {
    return 'resolve';
  }
  if (isSlaEscalationDecision(normalized)) {
    return normalized;
  }
  return null;
}

export function parseSlaEscalationExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SlaEscalationExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const expectedDecision = normalizeDecision(
    expectedState.expectedDecision ??
      expectedState.expected_decision ??
      expectedState.decision ??
      expectedState.answer
  );

  const minJustificationLength =
    typeof expectedState.minJustificationLength === 'number' &&
    Number.isFinite(expectedState.minJustificationLength) &&
    expectedState.minJustificationLength > 0
      ? Math.floor(expectedState.minJustificationLength)
      : undefined;

  let guidanceTopics: string[] | undefined;
  const rawTopics =
    expectedState.guidanceTopics ?? expectedState.policyTopics;
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
    expectedDecision: expectedDecision ?? undefined,
    minJustificationLength,
    guidanceTopics,
    topKGuidanceSections,
  };
}

export function extractSlaEscalationSubmission(
  submission: TicketSubmission
): SlaEscalationSubmission | null {
  const decision = normalizeDecision(
    submission.decision ??
      submission.escalationDecision ??
      submission.escalation_decision ??
      submission.action
  );

  const justificationRaw =
    submission.justification ??
    submission.rationale ??
    submission.reason ??
    submission.policyCitation;

  if (!decision || typeof justificationRaw !== 'string') {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'sla_escalation',
    decision,
    justification: justificationRaw.trim(),
  };
}

function scenarioTextFromTicket(ticket: ScorableTicket): string | undefined {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial)) return undefined;

  const nested = isPlainObject(initial.scenario)
    ? initial.scenario
    : isPlainObject(initial.supportScenario)
      ? initial.supportScenario
      : null;

  if (!nested) {
    if (typeof initial.scenarioText === 'string') {
      return initial.scenarioText.trim() || undefined;
    }
    return undefined;
  }

  const parts: string[] = [];
  for (const key of [
    'title',
    'summary',
    'description',
    'impact',
    'requester',
    'priorityHint',
    'symptoms',
    'timeline',
  ] as const) {
    const value = nested[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateSlaEscalationDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: SlaEscalationSubmission | null;
  structured: SlaEscalationStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseSlaEscalationExpectedState(ticket.expected_state);
  const minLength =
    expected.minJustificationLength ?? SLA_ESCALATION_MIN_JUSTIFICATION_LENGTH;
  const expectedDecision = expected.expectedDecision ?? null;
  const parsed = extractSlaEscalationSubmission(submission);

  const baseStructured: SlaEscalationStructuredResult = {
    style: 'sla_escalation',
    decision: parsed?.decision ?? null,
    expectedDecision,
    decisionMatch: false,
    justificationLength: parsed?.justification.length ?? 0,
    minJustificationLength: minLength,
    justificationLengthOk: false,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (!expectedDecision) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This SLA escalation ticket is missing expectedDecision in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include decision (escalate or resolve) and justification.',
    };
  }

  const justificationLength = parsed.justification.length;
  const justificationLengthOk = justificationLength >= minLength;
  const decisionMatch = parsed.decision === expectedDecision;

  const structured: SlaEscalationStructuredResult = {
    ...baseStructured,
    decision: parsed.decision,
    decisionMatch,
    justificationLength,
    justificationLengthOk,
  };

  if (!decisionMatch) {
    structured.reason = 'incorrect_decision';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Decision should be "${expectedDecision}" per the seeded SLA/escalation policy answer key. Re-read the mandatory escalate triggers vs Tier-1 resolve scope, then resubmit.`,
    };
  }

  if (!justificationLengthOk) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Justification must be at least ${minLength} characters. Cite the policy rule and scenario facts that support "${expectedDecision}".`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading justification against pinned SLA/escalation policy…',
  };
}

async function gradeJustificationWithPolicy(
  parsed: SlaEscalationSubmission,
  ticket: ScorableTicket,
  expected: SlaEscalationExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrieved: RetrievedSlaEscalationPolicy;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const query = [parsed.decision, parsed.justification].join('\n');
  const retrieved = retrieveSlaEscalationPolicy(query, {
    topK: expected.topKGuidanceSections,
    requiredSectionIds,
  });

  const prompt = buildSlaEscalationGradingPrompt(retrieved, {
    decision: parsed.decision,
    justification: parsed.justification,
    scenarioBrief: ticket.scenario_brief,
    scenarioText: scenarioTextFromTicket(ticket),
  });

  const grading = await callClaudeGrading(prompt);
  return { grading, retrieved };
}

export const slaEscalationTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateSlaEscalationDeterministic(
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

    const expected = parseSlaEscalationExpectedState(ticket.expected_state);

    try {
      const { grading, retrieved } = await gradeJustificationWithPolicy(
        deterministic.parsed,
        ticket,
        expected
      );

      const structured: SlaEscalationStructuredResult = {
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
        const structured: SlaEscalationStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Decision and justification length look good, but AI grading against the pinned SLA/escalation policy is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('SLA escalation policy grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'sla_escalation_grade',
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
          'Could not grade your justification against the pinned SLA/escalation policy. Please try again shortly.',
      };
    }
  },
};
