import type { Ticket, TicketProgressStatus } from '@/types';

import { normalizeTicketStatus } from '@/lib/tickets/status';

/**
 * Active tier = lowest tier that still has at least one unresolved ticket.
 * If every ticket is resolved, returns the highest tier present (or 1).
 */
export function getActiveTicketTier(
  tickets: Pick<Ticket, 'id' | 'tier'>[],
  progressByTicketId: Map<string, TicketProgressStatus | null | undefined>
): number {
  if (tickets.length === 0) return 1;

  const tiers = Array.from(new Set(tickets.map((t) => t.tier))).sort(
    (a, b) => a - b
  );

  for (const tier of tiers) {
    const tierTickets = tickets.filter((t) => t.tier === tier);
    const allResolved = tierTickets.every(
      (t) => normalizeTicketStatus(progressByTicketId.get(t.id)) === 'resolved'
    );
    if (!allResolved) return tier;
  }

  return tiers[tiers.length - 1] ?? 1;
}
