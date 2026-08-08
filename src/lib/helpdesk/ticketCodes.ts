import { isAoReviewTicketType } from '@/lib/capstone/ticketCodes';
import { isInfraDesignCapstoneTicketType } from '@/lib/infra/ticketCodes';

/**
 * Helpdesk track ticket codes for curriculum + PI-07 flagship capstone.
 *
 * Prefer `ticket_type` (and optional `initial_state.ticketCode`) over title matching.
 *
 * | Code  | ticket_type(s)                                      | Artifact / note                   |
 * |-------|-----------------------------------------------------|-----------------------------------|
 * | HD-03 | kb_writeup, helpdesk_kb, resolution_writeup, …      | Post-resolution KB articles       |
 * | HD-02 | (legacy alias for HD-03 / kb_writeup)               | Prefer HD-03 in new seeds         |
 * | HD-04 | coaching_feedback, peer_coaching, junior_notes_review | Junior-notes peer coaching      |
 * | HD-05 | kpi_report, ticket_metrics, helpdesk_kpis, …        | CSV KPI analysis report           |
 * | HD-07 | helpdesk_capstone, kb_capstone, onboarding_process_capstone | Mini KB + process doc (PI-07) |
 *
 * Curriculum note: KPI was renumbered HD-03 → HD-05 so HD-03 could become the
 * dedicated KB-article code. HD-02 remains a legacy alias for the same
 * kb_writeup family. Compilation matches by ticket_type, not code string.
 */

export const HD_TICKET_CODES = {
  /** Primary curriculum code for post-resolution KB articles. */
  KB_WRITEUP: 'HD-03',
  /** Legacy alias — same kb_writeup family as HD-03. */
  KB_WRITEUP_LEGACY: 'HD-02',
  COACHING_FEEDBACK: 'HD-04',
  KPI_REPORT: 'HD-05',
  CAPSTONE: 'HD-07',
} as const;

export type HdTicketCode =
  (typeof HD_TICKET_CODES)[keyof typeof HD_TICKET_CODES];

/** Canonical ticket_type values (bare or track-prefixed `helpdesk.*`). */
export const HD_TICKET_TYPES = {
  KB_WRITEUP: 'kb_writeup',
  HELPDESK_KB: 'helpdesk_kb',
  RESOLUTION_WRITEUP: 'resolution_writeup',
  /** Optional aliases concurrent agents may introduce. */
  KNOWLEDGE_ARTICLE: 'knowledge_article',
  KB_ARTICLE: 'kb_article',
  COACHING_FEEDBACK: 'coaching_feedback',
  PEER_COACHING: 'peer_coaching',
  JUNIOR_NOTES_REVIEW: 'junior_notes_review',
  KPI_REPORT: 'kpi_report',
  TICKET_METRICS: 'ticket_metrics',
  HELPDESK_KPIS: 'helpdesk_kpis',
  CSV_KPI_ANALYSIS: 'csv_kpi_analysis',
  HELPDESK_CAPSTONE: 'helpdesk_capstone',
  KB_CAPSTONE: 'kb_capstone',
  ONBOARDING_PROCESS_CAPSTONE: 'onboarding_process_capstone',
} as const;

/** Prior KB article ticket_type bases compiled into the mini knowledge base. */
export const DEFAULT_KB_SOURCE_TICKET_TYPES: readonly string[] = [
  HD_TICKET_TYPES.KB_WRITEUP,
  HD_TICKET_TYPES.HELPDESK_KB,
  HD_TICKET_TYPES.RESOLUTION_WRITEUP,
  HD_TICKET_TYPES.KNOWLEDGE_ARTICLE,
  HD_TICKET_TYPES.KB_ARTICLE,
] as const;

export function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isHelpdeskCapstoneTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === HD_TICKET_TYPES.HELPDESK_CAPSTONE ||
    base === HD_TICKET_TYPES.KB_CAPSTONE ||
    base === HD_TICKET_TYPES.ONBOARDING_PROCESS_CAPSTONE
  );
}

export function isKbSourceTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return DEFAULT_KB_SOURCE_TICKET_TYPES.includes(base);
}

/**
 * Ticket types that become the track flagship portfolio item on resolve (PI-07).
 * GRC uses ao_review; helpdesk uses helpdesk_capstone; sysadmin uses
 * infra_design_capstone.
 */
export function isFlagshipEligibleTicketType(ticketType: string): boolean {
  return (
    isAoReviewTicketType(ticketType) ||
    isHelpdeskCapstoneTicketType(ticketType) ||
    isInfraDesignCapstoneTicketType(ticketType)
  );
}
