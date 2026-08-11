import { describe, expect, it } from 'vitest';

import { mapTicketToConsoleTicket } from '@/lib/tickets/mapTicketToConsole';
import type { Ticket } from '@/types';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'ticket-1',
    tenant_id: 'tenant-a',
    track_id: 'track-grc',
    tier: 2,
    ticket_type: 'poam',
    difficulty: 'hard',
    sla_minutes: 45,
    scenario_brief: 'POA&M draft',
    initial_state: {},
    expected_state: {},
    dcwf_code: '722',
    sort_order: 10,
    engagement_id: null,
    engagement_stage: null,
    ...overrides,
  };
}

describe('mapTicketToConsoleTicket', () => {
  it('does not treat lesson difficulty as finding severity', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        difficulty: 'hard',
        initial_state: { title: 'Capstone package review' },
      }),
      trackSlug: 'grc',
    });

    expect(mapped.difficulty).toBe('hard');
    expect(mapped.severity).toBeUndefined();
  });

  it('keeps explicit finding severity from initial_state', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        difficulty: 'medium',
        initial_state: {
          title: 'AC-2 gap',
          severity: 'high',
        },
      }),
      trackSlug: 'grc',
    });

    expect(mapped.difficulty).toBe('medium');
    expect(mapped.severity).toBe('high');
  });

  it('ignores non-severity strings in the severity field', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        difficulty: 'easy',
        initial_state: { severity: 'hard' },
      }),
      trackSlug: 'grc',
    });

    expect(mapped.severity).toBeUndefined();
  });

  it('maps SLA freeze fields from progress', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket(),
      trackSlug: 'grc',
      status: 'resolved',
      startedAt: '2026-01-01T00:00:00.000Z',
      resolvedAt: '2026-01-01T00:12:00.000Z',
      slaDueAt: '2026-01-01T00:45:00.000Z',
      slaMet: true,
    });

    expect(mapped.status).toBe('resolved');
    expect(mapped.resolvedAt).toBe('2026-01-01T00:12:00.000Z');
    expect(mapped.slaDueAt).toBe('2026-01-01T00:45:00.000Z');
    expect(mapped.slaMet).toBe(true);
  });
});
