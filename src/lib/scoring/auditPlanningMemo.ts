import {
  buildFreeTextTrainingFeedback,
  type TrainingFeedback,
} from '@/lib/feedback';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { AUDIT_PLANNING_MEMO_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Audit planning memo scoring (PI-02 stage 1).
 *
 * Deterministic completeness: objective, scope, riskFocus, plannedProcedures
 * must be present and meet min length.
 */

export { AUDIT_PLANNING_MEMO_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export const AUDIT_PLANNING_MEMO_TICKET_TYPES = [
  'audit_planning_memo',
  'planning_memo',
] as const;

export type AuditPlanningMemoTicketType =
  (typeof AUDIT_PLANNING_MEMO_TICKET_TYPES)[number];

export type AuditPlanningMemoExpectedState = {
  minFieldLength?: number;
};

export type AuditPlanningMemoSubmission = {
  type?: string;
  objective: string;
  scope: string;
  riskFocus: string;
  plannedProcedures: string;
};

export type AuditPlanningMemoStructuredResult = {
  style: 'audit_planning_memo';
  objectiveLength: number;
  scopeLength: number;
  riskFocusLength: number;
  plannedProceduresLength: number;
  minFieldLength: number;
  fieldsOk: boolean;
  trainingFeedback?: TrainingFeedback;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isAuditPlanningMemoTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (AUDIT_PLANNING_MEMO_TICKET_TYPES as readonly string[]).includes(base);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseAuditPlanningMemoExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): AuditPlanningMemoExpectedState {
  if (!isPlainObject(expectedState)) return {};
  const min = expectedState.minFieldLength;
  return {
    minFieldLength:
      typeof min === 'number' && Number.isFinite(min) && min > 0
        ? Math.floor(min)
        : undefined,
  };
}

export function extractAuditPlanningMemoSubmission(
  submission: TicketSubmission
): AuditPlanningMemoSubmission | null {
  const objective = asNonEmptyString(submission.objective);
  const scope = asNonEmptyString(submission.scope);
  const riskFocus =
    asNonEmptyString(submission.riskFocus) ??
    asNonEmptyString(submission.risk_focus);
  const plannedProcedures =
    asNonEmptyString(submission.plannedProcedures) ??
    asNonEmptyString(submission.planned_procedures);

  if (!objective || !scope || !riskFocus || !plannedProcedures) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'audit_planning_memo',
    objective,
    scope,
    riskFocus,
    plannedProcedures,
  };
}

export function evaluateAuditPlanningMemoDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: AuditPlanningMemoSubmission | null;
  structured: AuditPlanningMemoStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseAuditPlanningMemoExpectedState(ticket.expected_state);
  const minFieldLength =
    expected.minFieldLength ?? AUDIT_PLANNING_MEMO_MIN_FIELD_LENGTH;
  const parsed = extractAuditPlanningMemoSubmission(submission);

  if (!parsed) {
    const structured: AuditPlanningMemoStructuredResult = {
      style: 'audit_planning_memo',
      objectiveLength: 0,
      scopeLength: 0,
      riskFocusLength: 0,
      plannedProceduresLength: 0,
      minFieldLength,
      fieldsOk: false,
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Planning memo must include objective, scope, risk focus, and planned procedures.',
    };
  }

  const lengths = {
    objectiveLength: parsed.objective.length,
    scopeLength: parsed.scope.length,
    riskFocusLength: parsed.riskFocus.length,
    plannedProceduresLength: parsed.plannedProcedures.length,
  };

  const shortFields = (
    [
      ['objective', lengths.objectiveLength],
      ['scope', lengths.scopeLength],
      ['riskFocus', lengths.riskFocusLength],
      ['plannedProcedures', lengths.plannedProceduresLength],
    ] as const
  ).filter(([, len]) => len < minFieldLength);

  const fieldsOk = shortFields.length === 0;
  const structured: AuditPlanningMemoStructuredResult = {
    style: 'audit_planning_memo',
    ...lengths,
    minFieldLength,
    fieldsOk,
    reason: fieldsOk ? undefined : 'fields_too_short',
  };

  if (!fieldsOk) {
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Each memo section must be at least ${minFieldLength} characters. Short: ${shortFields
        .map(([name]) => name)
        .join(', ')}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Planning memo sections are complete. Proceed to engagement control tests.',
  };
}

export const auditPlanningMemoTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateAuditPlanningMemoDeterministic(submission, ticket);
    const status = result.ok ? 'resolved' : 'needs_revision';
    const scorePercent = result.ok ? 100 : result.structured.fieldsOk ? 60 : 25;
    const trainingFeedback = buildFreeTextTrainingFeedback({
      expectedState: ticket.expected_state,
      submission: (result.parsed ?? submission) as Record<string, unknown>,
      status,
      summary: result.feedback,
      scorePercent,
      initialState: ticket.initial_state,
    });

    return {
      status,
      structuredResult: {
        ...result.structured,
        ...(trainingFeedback ? { trainingFeedback } : {}),
      },
      feedback: result.feedback,
    };
  },
};
