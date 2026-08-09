import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildIssmEscalationGradingPrompt } from '@/lib/grading/buildIssmEscalationGradingPrompt';
import {
  retrieveIssmEscalationGuidance,
  type RetrievedIssmEscalationGuidance,
} from '@/lib/nist/getIssmEscalationGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * ISSO→ISSM cross-system escalation ticket scoring.
 *
 * Deterministic:
 *   - decision present and matches expected_state.expectedDecision
 *   - memo meets minimum length
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned ISSM escalation-criteria guidance
 *   - grade memo against retrieved guidance only
 */

export {
  ISSM_ESCALATION_DECISIONS,
  ISSM_ESCALATION_DECISION_LABELS,
  ISSM_ESCALATION_MIN_MEMO_LENGTH,
  isIssmEscalationDecision,
  isIssmEscalationTicketType,
  type IssmEscalationDecision,
} from '@/lib/scoring/ticketUi';
import {
  ISSM_ESCALATION_MIN_MEMO_LENGTH,
  isIssmEscalationDecision,
  type IssmEscalationDecision,
} from '@/lib/scoring/ticketUi';

export type IssmEscalationExpectedState = {
  /** Answer key: escalate | handle_at_isso */
  expectedDecision?: IssmEscalationDecision;
  minMemoLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type IssmEscalationSubmission = {
  type?: string;
  decision: IssmEscalationDecision;
  memo: string;
};

export type IssmEscalationStructuredResult = {
  style: 'issm_escalation';
  decision: IssmEscalationDecision | null;
  expectedDecision: IssmEscalationDecision | null;
  decisionMatch: boolean;
  memoLength: number;
  minMemoLength: number;
  memoLengthOk: boolean;
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

function normalizeDecision(value: unknown): IssmEscalationDecision | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (
    normalized === 'escalate' ||
    normalized === 'escalate_to_issm' ||
    normalized === 'issm' ||
    normalized === 'issm_escalation'
  ) {
    return 'escalate';
  }

  if (
    normalized === 'handle_at_isso' ||
    normalized === 'isso_level' ||
    normalized === 'retain_at_isso' ||
    normalized === 'do_not_escalate' ||
    normalized === 'no_escalate'
  ) {
    return 'handle_at_isso';
  }

  if (isIssmEscalationDecision(normalized)) {
    return normalized;
  }
  return null;
}

export function parseIssmEscalationExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): IssmEscalationExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const expectedDecision = normalizeDecision(
    expectedState.expectedDecision ??
      expectedState.expected_decision ??
      expectedState.decision ??
      expectedState.answer
  );

  const minMemoLengthRaw =
    expectedState.minMemoLength ??
    expectedState.minJustificationLength ??
    expectedState.min_memo_length;
  const minMemoLength =
    typeof minMemoLengthRaw === 'number' &&
    Number.isFinite(minMemoLengthRaw) &&
    minMemoLengthRaw > 0
      ? Math.floor(minMemoLengthRaw)
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
    expectedDecision: expectedDecision ?? undefined,
    minMemoLength,
    guidanceTopics,
    topKGuidanceSections,
  };
}

export function extractIssmEscalationSubmission(
  submission: TicketSubmission
): IssmEscalationSubmission | null {
  const decision = normalizeDecision(
    submission.decision ??
      submission.escalationDecision ??
      submission.escalation_decision ??
      submission.action
  );

  const memoRaw =
    submission.memo ??
    submission.escalationMemo ??
    submission.escalation_memo ??
    submission.justification ??
    submission.rationale ??
    submission.reason;

  if (!decision || typeof memoRaw !== 'string') {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'issm_escalation',
    decision,
    memo: memoRaw.trim(),
  };
}

function scenarioTextFromTicket(ticket: ScorableTicket): string | undefined {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial)) return undefined;

  const nested = isPlainObject(initial.scenario)
    ? initial.scenario
    : isPlainObject(initial.riskScenario)
      ? initial.riskScenario
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
    'sharedDependency',
    'impact',
    'resourceNeeds',
    'residualRisk',
    'conflictingPriorities',
    'timeline',
  ] as const) {
    const value = nested[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    }
  }

  const systems = nested.affectedSystems ?? nested.systems;
  if (Array.isArray(systems)) {
    const lines = systems
      .map((entry, index) => {
        if (!isPlainObject(entry)) return null;
        const name =
          typeof entry.name === 'string'
            ? entry.name
            : typeof entry.system === 'string'
              ? entry.system
              : `System ${index + 1}`;
        const isso =
          typeof entry.isso === 'string'
            ? entry.isso
            : typeof entry.issoName === 'string'
              ? entry.issoName
              : '';
        const impact =
          typeof entry.impactLevel === 'string'
            ? entry.impactLevel
            : typeof entry.fips199 === 'string'
              ? entry.fips199
              : '';
        return `- ${name}${isso ? ` (ISSO: ${isso})` : ''}${impact ? `; FIPS 199: ${impact}` : ''}`;
      })
      .filter((line): line is string => Boolean(line));
    if (lines.length > 0) {
      parts.push(`affectedSystems:\n${lines.join('\n')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateIssmEscalationDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: IssmEscalationSubmission | null;
  structured: IssmEscalationStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseIssmEscalationExpectedState(ticket.expected_state);
  const minLength = expected.minMemoLength ?? ISSM_ESCALATION_MIN_MEMO_LENGTH;
  const expectedDecision = expected.expectedDecision ?? null;
  const parsed = extractIssmEscalationSubmission(submission);

  const baseStructured: IssmEscalationStructuredResult = {
    style: 'issm_escalation',
    decision: parsed?.decision ?? null,
    expectedDecision,
    decisionMatch: false,
    memoLength: parsed?.memo.length ?? 0,
    minMemoLength: minLength,
    memoLengthOk: false,
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
        'This ISSM escalation ticket is missing expectedDecision in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include decision (escalate or handle_at_isso) and a memo/rationale.',
    };
  }

  const memoLength = parsed.memo.length;
  const memoLengthOk = memoLength >= minLength;
  const decisionMatch = parsed.decision === expectedDecision;

  const structured: IssmEscalationStructuredResult = {
    ...baseStructured,
    decision: parsed.decision,
    decisionMatch,
    memoLength,
    memoLengthOk,
  };

  if (!decisionMatch) {
    structured.reason = 'incorrect_decision';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Decision should be "${expectedDecision}" per the seeded escalation answer key. Re-read cross-system impact and resource/authority limits, then resubmit.`,
    };
  }

  if (!memoLengthOk) {
    structured.reason = 'memo_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Memo must be at least ${minLength} characters. Ground "${expectedDecision}" in escalation criteria and scenario facts.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading memo against pinned ISSM escalation criteria…',
  };
}

async function gradeMemoWithGuidance(
  parsed: IssmEscalationSubmission,
  ticket: ScorableTicket,
  expected: IssmEscalationExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrieved: RetrievedIssmEscalationGuidance;
}> {
  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const query = [parsed.decision, parsed.memo].join('\n');
  const retrieved = retrieveIssmEscalationGuidance(query, {
    topK: expected.topKGuidanceSections,
    requiredSectionIds,
  });

  const prompt = buildIssmEscalationGradingPrompt(retrieved, {
    decision: parsed.decision,
    memo: parsed.memo,
    scenarioBrief: ticket.scenario_brief,
    scenarioText: scenarioTextFromTicket(ticket),
  });

  const grading = await callClaudeGrading(prompt);
  return { grading, retrieved };
}

export const issmEscalationTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateIssmEscalationDeterministic(
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

    const expected = parseIssmEscalationExpectedState(ticket.expected_state);

    try {
      const { grading, retrieved } = await gradeMemoWithGuidance(
        deterministic.parsed,
        ticket,
        expected
      );

      const structured: IssmEscalationStructuredResult = {
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
        const structured: IssmEscalationStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Decision and memo length look good, but AI grading against the pinned ISSM escalation criteria is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('ISSM escalation guidance grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'issm_escalation_grade',
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
          'Could not grade your memo against the pinned ISSM escalation criteria. Please try again shortly.',
      };
    }
  },
};
