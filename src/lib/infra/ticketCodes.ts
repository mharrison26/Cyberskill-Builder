/**
 * Sysadmin / infrastructure track ticket codes for the architecture-decision
 * capstone (PI-07 flagship portfolio item).
 *
 * Prefer `ticket_type` (and optional `initial_state.ticketCode`) over title matching.
 *
 * | Code  | ticket_type(s)                                      | Artifact / note                          |
 * |-------|-----------------------------------------------------|------------------------------------------|
 * | SA-07 | infra_design_capstone, architecture_decision        | Design decision doc + tradeoff Q&A (PI-07) |
 */

export const SA_TICKET_CODES = {
  INFRA_DESIGN_CAPSTONE: 'SA-07',
} as const;

export type SaTicketCode =
  (typeof SA_TICKET_CODES)[keyof typeof SA_TICKET_CODES];

/** Canonical ticket_type values (bare or track-prefixed `sysadmin.*`). */
export const SA_TICKET_TYPES = {
  INFRA_DESIGN_CAPSTONE: 'infra_design_capstone',
  ARCHITECTURE_DECISION: 'architecture_decision',
} as const;

export function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isInfraDesignCapstoneTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === SA_TICKET_TYPES.INFRA_DESIGN_CAPSTONE ||
    base === SA_TICKET_TYPES.ARCHITECTURE_DECISION
  );
}
