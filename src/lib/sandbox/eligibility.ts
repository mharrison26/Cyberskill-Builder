import type { Ticket } from '@/types';

/**
 * Gate: Fly Machines sandboxes are only for tickets that need a real Linux shell.
 *
 * Allowed when ALL of:
 *   1. ticket.tier >= 2 (Tier 2+)
 *   2. ticket_type base is a shell-oriented type (sysadmin / helpdesk family)
 *
 * ticket_type may be a bare key (`sysadmin`) or track-prefixed (`linux.sysadmin`).
 * `difficulty` is accepted as a soft signal when the base type is ambiguous
 * (e.g. type contains "linux" and difficulty is intermediate/advanced) — primary
 * gate remains tier + ticket_type.
 */

const SHELL_TICKET_TYPE_BASES = new Set([
  'sysadmin',
  'helpdesk',
  'linux_admin',
  'linux',
  'incident',
  'incident_response',
]);

export function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isShellSandboxTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  if (SHELL_TICKET_TYPE_BASES.has(base)) return true;

  // Prefixed / compound types: e.g. "track.sysadmin_lab"
  const normalized = ticketType.trim().toLowerCase();
  return (
    normalized.includes('sysadmin') ||
    normalized.includes('helpdesk') ||
    normalized.includes('linux_admin')
  );
}

export type SandboxEligibility = { ok: true } | { ok: false; reason: string };

export function assertSandboxEligible(
  ticket: Pick<Ticket, 'tier' | 'ticket_type' | 'difficulty'>
): SandboxEligibility {
  if (!Number.isFinite(ticket.tier) || ticket.tier < 2) {
    return {
      ok: false,
      reason:
        'Fly sandbox is only available for Tier 2+ tickets that need a real shell',
    };
  }

  if (isShellSandboxTicketType(ticket.ticket_type)) {
    return { ok: true };
  }

  // Soft fallback: tier 2+ with an advanced/intermediate difficulty and a
  // linux-ish type string still qualifies when naming is inconsistent.
  const difficulty = ticket.difficulty.trim().toLowerCase();
  const typeLower = ticket.ticket_type.trim().toLowerCase();
  const difficultyLooksAdvanced =
    difficulty === 'intermediate' ||
    difficulty === 'advanced' ||
    difficulty === '2' ||
    difficulty === '3';
  if (difficultyLooksAdvanced && typeLower.includes('linux')) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      'Fly sandbox is only available for sysadmin/helpdesk (shell) ticket types',
  };
}
