import { describe, expect, it } from 'vitest';

import { getActiveTicketTier } from '@/lib/tickets/activeTier';

describe('getActiveTicketTier', () => {
  it('defaults to 1 when there are no tickets', () => {
    expect(getActiveTicketTier([], new Map())).toBe(1);
  });

  it('returns the lowest unresolved tier', () => {
    const tickets = [
      { id: 'a', tier: 1 },
      { id: 'b', tier: 1 },
      { id: 'c', tier: 2 },
    ];
    const progress = new Map([
      ['a', 'resolved' as const],
      ['b', 'in_progress' as const],
    ]);
    expect(getActiveTicketTier(tickets, progress)).toBe(1);
  });

  it('advances when a tier is fully resolved', () => {
    const tickets = [
      { id: 'a', tier: 1 },
      { id: 'b', tier: 2 },
      { id: 'c', tier: 3 },
    ];
    const progress = new Map([['a', 'resolved' as const]]);
    expect(getActiveTicketTier(tickets, progress)).toBe(2);
  });

  it('returns highest tier when everything is resolved', () => {
    const tickets = [
      { id: 'a', tier: 1 },
      { id: 'b', tier: 2 },
    ];
    const progress = new Map([
      ['a', 'resolved' as const],
      ['b', 'resolved' as const],
    ]);
    expect(getActiveTicketTier(tickets, progress)).toBe(2);
  });
});
