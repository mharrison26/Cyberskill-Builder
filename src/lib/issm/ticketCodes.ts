/**
 * ISSM track ticket codes for curriculum + program-strategy flagship capstone.
 *
 * Prefer `ticket_type` (and optional `initial_state.ticketCode`) over title matching.
 *
 * | Code    | ticket_type(s)                                                         | Artifact / note                                      |
 * |---------|------------------------------------------------------------------------|------------------------------------------------------|
 * | ISSM-07 | security_strategy_capstone, one_year_security_strategy,                | One-year security strategy memo (flagship)           |
 * |         | issm_strategy_memo_capstone                                            |                                                      |
 */

export const ISSM_TICKET_CODES = {
  SECURITY_STRATEGY_CAPSTONE: 'ISSM-07',
} as const;

export type IssmTicketCode =
  (typeof ISSM_TICKET_CODES)[keyof typeof ISSM_TICKET_CODES];

/** Canonical ticket_type values (bare or track-prefixed `issm.*`). */
export const ISSM_TICKET_TYPES = {
  SECURITY_STRATEGY_CAPSTONE: 'security_strategy_capstone',
  ONE_YEAR_SECURITY_STRATEGY: 'one_year_security_strategy',
  ISSM_STRATEGY_MEMO_CAPSTONE: 'issm_strategy_memo_capstone',
} as const;

export function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isSecurityStrategyCapstoneTicketType(
  ticketType: string
): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === ISSM_TICKET_TYPES.SECURITY_STRATEGY_CAPSTONE ||
    base === ISSM_TICKET_TYPES.ONE_YEAR_SECURITY_STRATEGY ||
    base === ISSM_TICKET_TYPES.ISSM_STRATEGY_MEMO_CAPSTONE
  );
}
