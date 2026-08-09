/**
 * GRC audit-engagement ticket codes (PI-02 sequence + flagship AC brief).
 *
 * Prefer `ticket_type` (and optional `initial_state.ticketCode`) over title matching.
 *
 * | Code   | ticket_type(s)                                      | Artifact / note                          |
 * |--------|-----------------------------------------------------|------------------------------------------|
 * | AUD-05 | cccer, audit_finding_cccer (parallel agents)        | CCCER exception write-up                 |
 * | AUD-06 | findings_summary, engagement_findings               | Engagement findings summary              |
 * | AUD-07 | audit_committee_brief, executive_summary_ac         | Exec summary + AC questions (flagship)   |
 */

export const AUD_TICKET_CODES = {
  CCCER_EXCEPTION: 'AUD-05',
  FINDINGS_SUMMARY: 'AUD-06',
  AUDIT_COMMITTEE_BRIEF: 'AUD-07',
} as const;

export type AudTicketCode =
  (typeof AUD_TICKET_CODES)[keyof typeof AUD_TICKET_CODES];

export const AUD_TICKET_TYPES = {
  CCCER: 'cccer',
  AUDIT_FINDING_CCCER: 'audit_finding_cccer',
  FINDINGS_SUMMARY: 'findings_summary',
  ENGAGEMENT_FINDINGS: 'engagement_findings',
  AUDIT_COMMITTEE_BRIEF: 'audit_committee_brief',
  EXECUTIVE_SUMMARY_AC: 'executive_summary_ac',
} as const;

/** Prior findings ticket_type bases compiled into the AUD-07 package. */
export const DEFAULT_AC_BRIEF_SOURCE_TICKET_TYPES: readonly string[] = [
  AUD_TICKET_TYPES.FINDINGS_SUMMARY,
  AUD_TICKET_TYPES.ENGAGEMENT_FINDINGS,
  AUD_TICKET_TYPES.CCCER,
  AUD_TICKET_TYPES.AUDIT_FINDING_CCCER,
] as const;

export function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isAuditCommitteeBriefTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === AUD_TICKET_TYPES.AUDIT_COMMITTEE_BRIEF ||
    base === AUD_TICKET_TYPES.EXECUTIVE_SUMMARY_AC
  );
}

export function isAcBriefSourceTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (DEFAULT_AC_BRIEF_SOURCE_TICKET_TYPES as readonly string[]).includes(
    base
  );
}
