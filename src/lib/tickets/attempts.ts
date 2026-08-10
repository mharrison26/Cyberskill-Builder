/** Default max graded attempts when tickets.max_attempts is null. */
export const DEFAULT_TICKET_MAX_ATTEMPTS = 3;

export type TicketAttemptScoreStatus = 'resolved' | 'needs_revision';

export type TicketAttemptRecord = {
  id: string;
  attempt_number: number;
  submitted_at: string;
  score_status: TicketAttemptScoreStatus;
  feedback: string | null;
  submission: Record<string, unknown>;
  structured_result: Record<string, unknown>;
  sla_started_at: string | null;
  sla_due_at: string | null;
  sla_resolved_at: string | null;
  sla_met: boolean | null;
};

export function resolveMaxAttempts(
  ticketMaxAttempts: number | null | undefined
): number {
  if (
    typeof ticketMaxAttempts === 'number' &&
    Number.isFinite(ticketMaxAttempts) &&
    ticketMaxAttempts >= 1
  ) {
    return Math.floor(ticketMaxAttempts);
  }
  return DEFAULT_TICKET_MAX_ATTEMPTS;
}

export function canStartNewAttempt(args: {
  attemptCount: number;
  maxAttempts: number;
}): boolean {
  return args.attemptCount < args.maxAttempts;
}

export function nextAttemptNumber(attemptCount: number): number {
  return Math.max(0, Math.floor(attemptCount)) + 1;
}
