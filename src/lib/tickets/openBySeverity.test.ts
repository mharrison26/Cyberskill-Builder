import { describe, expect, it } from 'vitest';

import {
  countOpenBySeverity,
  FINDING_SEVERITY_ORDER,
} from '@/lib/tickets/openBySeverity';
import type { MockTrackTicket } from '@/types';

function ticket(
  overrides: Partial<MockTrackTicket> & Pick<MockTrackTicket, 'id'>
): MockTrackTicket {
  return {
    trackSlug: 'grc',
    title: 'Finding',
    ticketType: 'poam',
    difficulty: 'medium',
    slaMinutes: 30,
    startedAt: null,
    status: 'new',
    sortOrder: 1,
    ...overrides,
  };
}

describe('countOpenBySeverity', () => {
  it('partitions open tickets so rated buckets + unrated = open total', () => {
    const result = countOpenBySeverity([
      ticket({ id: '1', severity: 'critical', status: 'new' }),
      ticket({ id: '2', severity: 'high', status: 'in_progress' }),
      ticket({ id: '3', severity: 'medium', status: 'new' }),
      ticket({ id: '4', severity: 'low', status: 'in_progress' }),
      ticket({ id: '5', severity: undefined, status: 'new' }),
      ticket({ id: '6', severity: 'high', status: 'resolved' }),
      ticket({ id: '7', difficulty: 'hard', status: 'new' }),
    ]);

    expect(result.counts).toEqual({
      critical: 1,
      high: 1,
      medium: 1,
      low: 1,
    });
    expect(result.unrated).toBe(2);
    expect(result.openTotal).toBe(6);

    const ratedSum = FINDING_SEVERITY_ORDER.reduce(
      (sum, sev) => sum + result.counts[sev],
      0
    );
    expect(ratedSum + result.unrated).toBe(result.openTotal);
  });

  it('does not default missing severity to medium', () => {
    const result = countOpenBySeverity([
      ticket({ id: 'a', status: 'new' }),
      ticket({ id: 'b', difficulty: 'medium', status: 'in_progress' }),
    ]);

    expect(result.counts.medium).toBe(0);
    expect(result.unrated).toBe(2);
    expect(result.openTotal).toBe(2);
  });
});
