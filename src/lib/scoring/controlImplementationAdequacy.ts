import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildControlImplementationAdequacyGradingPrompt } from '@/lib/grading/buildControlImplementationAdequacyGradingPrompt';
import { captureFeatureException } from '@/lib/observability/sentry';
import {
  getControlText,
  OSCAL_CATALOG_PATH,
  type ControlText,
} from '@/lib/oscal/getControl';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Control implementation adequacy scoring.
 *
 * Deterministic:
 *   - judgment present and matches expected_state.expectedJudgment
 *   - justification meets minimum length
 *
 * RAG / LLM (F25 + F26 pattern):
 *   - retrieve live SP 800-53 control text via getControlText
 *   - grade justification against retrieved control text only
 */

export {
  CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENTS,
  CONTROL_IMPLEMENTATION_ADEQUACY_JUDGMENT_LABELS,
  CONTROL_IMPLEMENTATION_ADEQUACY_MIN_JUSTIFICATION_LENGTH,
  isControlImplementationAdequacyJudgment,
  isControlImplementationAdequacyTicketType,
  type ControlImplementationAdequacyJudgment,
} from '@/lib/scoring/ticketUi';
import {
  CONTROL_IMPLEMENTATION_ADEQUACY_MIN_JUSTIFICATION_LENGTH,
  isControlImplementationAdequacyJudgment,
  type ControlImplementationAdequacyJudgment,
} from '@/lib/scoring/ticketUi';

export type ControlImplementationAdequacyExpectedState = {
  expectedJudgment?: ControlImplementationAdequacyJudgment;
  controlId?: string;
  minJustificationLength?: number;
  guidanceTopics?: string[];
};

export type ControlImplementationAdequacySubmission = {
  type?: string;
  judgment: ControlImplementationAdequacyJudgment;
  justification: string;
};

export type ControlImplementationAdequacyStructuredResult = {
  style: 'control_implementation_adequacy';
  judgment: ControlImplementationAdequacyJudgment | null;
  expectedJudgment: ControlImplementationAdequacyJudgment | null;
  judgmentMatch: boolean;
  justificationLength: number;
  minJustificationLength: number;
  justificationLengthOk: boolean;
  controlId: string | null;
  catalogPath: string | null;
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

function normalizeJudgment(
  value: unknown
): ControlImplementationAdequacyJudgment | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (
    normalized === 'adequate' ||
    normalized === 'sufficient' ||
    normalized === 'meets' ||
    normalized === 'met'
  ) {
    return 'adequate';
  }
  if (
    normalized === 'inadequate' ||
    normalized === 'insufficient' ||
    normalized === 'does_not_meet' ||
    normalized === 'not_adequate' ||
    normalized === 'fails'
  ) {
    return 'inadequate';
  }
  if (isControlImplementationAdequacyJudgment(normalized)) {
    return normalized;
  }
  return null;
}

function readControlId(
  record: Record<string, unknown> | null | undefined
): string | null {
  if (!record) return null;
  const value = record.controlId ?? record.control_id;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
}

export function resolveControlImplementationAdequacyControlId(
  ticket: ScorableTicket
): string | null {
  return (
    readControlId(ticket.expected_state) ??
    readControlId(ticket.initial_state) ??
    null
  );
}

export function parseControlImplementationAdequacyExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ControlImplementationAdequacyExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const expectedJudgment = normalizeJudgment(
    expectedState.expectedJudgment ??
      expectedState.expected_judgment ??
      expectedState.judgment ??
      expectedState.answer
  );

  const controlId = readControlId(expectedState) ?? undefined;

  const minJustificationLength =
    typeof expectedState.minJustificationLength === 'number' &&
    Number.isFinite(expectedState.minJustificationLength) &&
    expectedState.minJustificationLength > 0
      ? Math.floor(expectedState.minJustificationLength)
      : undefined;

  let guidanceTopics: string[] | undefined;
  const rawTopics = expectedState.guidanceTopics;
  if (Array.isArray(rawTopics)) {
    const topics = rawTopics
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (topics.length > 0) guidanceTopics = topics;
  }

  return {
    expectedJudgment: expectedJudgment ?? undefined,
    controlId,
    minJustificationLength,
    guidanceTopics,
  };
}

export function extractControlImplementationAdequacySubmission(
  submission: TicketSubmission
): ControlImplementationAdequacySubmission | null {
  const judgment = normalizeJudgment(
    submission.judgment ??
      submission.adequacy ??
      submission.decision ??
      submission.assessment
  );

  const justificationRaw =
    submission.justification ??
    submission.rationale ??
    submission.reason ??
    submission.explanation;

  if (!judgment || typeof justificationRaw !== 'string') {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'control_implementation_adequacy',
    judgment,
    justification: justificationRaw.trim(),
  };
}

function implementationStatementFromTicket(ticket: ScorableTicket): string {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial)) return '';

  for (const key of [
    'implementationStatement',
    'implementation_statement',
    'statement',
    'controlImplementation',
  ] as const) {
    const value = initial[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function systemNameFromTicket(ticket: ScorableTicket): string | undefined {
  const initial = ticket.initial_state;
  if (!isPlainObject(initial)) return undefined;
  for (const key of ['systemName', 'system_name', 'system'] as const) {
    const value = initial[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function evaluateControlImplementationAdequacyDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ControlImplementationAdequacySubmission | null;
  structured: ControlImplementationAdequacyStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseControlImplementationAdequacyExpectedState(
    ticket.expected_state
  );
  const minLength =
    expected.minJustificationLength ??
    CONTROL_IMPLEMENTATION_ADEQUACY_MIN_JUSTIFICATION_LENGTH;
  const expectedJudgment = expected.expectedJudgment ?? null;
  const controlId = resolveControlImplementationAdequacyControlId(ticket);
  const parsed = extractControlImplementationAdequacySubmission(submission);

  const baseStructured: ControlImplementationAdequacyStructuredResult = {
    style: 'control_implementation_adequacy',
    judgment: parsed?.judgment ?? null,
    expectedJudgment,
    judgmentMatch: false,
    justificationLength: parsed?.justification.length ?? 0,
    minJustificationLength: minLength,
    justificationLengthOk: false,
    controlId,
    catalogPath: null,
  };

  if (!expectedJudgment) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This control implementation adequacy ticket is missing expectedJudgment in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!controlId) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_control_id',
      },
      ok: false,
      feedback:
        'This ticket is missing controlId in expected_state or initial_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include judgment (adequate or inadequate) and justification.',
    };
  }

  const justificationLength = parsed.justification.length;
  const justificationLengthOk = justificationLength >= minLength;
  const judgmentMatch = parsed.judgment === expectedJudgment;

  const structured: ControlImplementationAdequacyStructuredResult = {
    ...baseStructured,
    judgment: parsed.judgment,
    judgmentMatch,
    justificationLength,
    justificationLengthOk,
  };

  if (!judgmentMatch) {
    structured.reason = 'incorrect_judgment';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Judgment should be "${expectedJudgment}" per the seeded answer key. Re-read the control requirements against the implementation statement, then resubmit.`,
    };
  }

  if (!justificationLengthOk) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Justification must be at least ${minLength} characters. Cite specific control requirements and how the implementation statement meets or fails them.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading justification against retrieved live control text…',
  };
}

async function gradeJustificationWithControlText(
  parsed: ControlImplementationAdequacySubmission,
  ticket: ScorableTicket,
  controlId: string
): Promise<{
  grading: ClaudeGradingResult;
  control: ControlText;
}> {
  const control = getControlText(controlId);
  const prompt = buildControlImplementationAdequacyGradingPrompt(control, {
    judgment: parsed.judgment,
    justification: parsed.justification,
    implementationStatement: implementationStatementFromTicket(ticket),
    systemName: systemNameFromTicket(ticket),
    scenarioBrief: ticket.scenario_brief,
  });

  const grading = await callClaudeGrading(prompt);
  return { grading, control };
}

export const controlImplementationAdequacyTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateControlImplementationAdequacyDeterministic(
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

    const controlId = deterministic.structured.controlId;
    if (!controlId) {
      return {
        status: 'needs_revision',
        structuredResult: {
          ...deterministic.structured,
          reason: 'misconfigured_control_id',
        },
        feedback:
          'This ticket is missing controlId. Ask an admin to fix the seed.',
      };
    }

    try {
      const { grading, control } = await gradeJustificationWithControlText(
        deterministic.parsed,
        ticket,
        controlId
      );

      const structured: ControlImplementationAdequacyStructuredResult = {
        ...deterministic.structured,
        controlId: control.controlId,
        catalogPath: OSCAL_CATALOG_PATH,
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
        const structured: ControlImplementationAdequacyStructuredResult = {
          ...deterministic.structured,
          catalogPath: OSCAL_CATALOG_PATH,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Judgment and justification length look good, but AI grading against the retrieved live control text is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      if (error instanceof Error && error.message.startsWith('Control not found')) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...deterministic.structured,
            reason: 'control_not_found',
          },
          feedback: `Could not retrieve live control text for "${controlId}". Ask an admin to fix the seeded controlId.`,
        };
      }

      console.error('Control implementation adequacy grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-01',
        operation: 'control_implementation_adequacy_grade',
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
          'Could not grade your justification against the retrieved control text. Please try again shortly.',
      };
    }
  },
};
