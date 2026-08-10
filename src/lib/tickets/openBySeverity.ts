import { isOpenTicketStatus } from '@/lib/tickets/status';
import type { MockTrackTicket } from '@/types';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export const FINDING_SEVERITY_ORDER: FindingSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
];

export function isFindingSeverity(value: unknown): value is FindingSeverity {
  return (
    value === 'critical' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  );
}

/**
 * Count open findings by real severity only.
 * Null / missing severity is not bucketed (and never defaults to medium).
 * The four buckets plus `unrated` always equal `openTotal`.
 */
export function countOpenBySeverity(tickets: MockTrackTicket[]): {
  counts: Record<FindingSeverity, number>;
  openTotal: number;
  unrated: number;
} {
  const counts: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  let openTotal = 0;
  let unrated = 0;

  for (const ticket of tickets) {
    if (!isOpenTicketStatus(ticket.status)) continue;
    openTotal += 1;
    if (!isFindingSeverity(ticket.severity)) {
      unrated += 1;
      continue;
    }
    counts[ticket.severity] += 1;
  }

  return { counts, openTotal, unrated };
}
