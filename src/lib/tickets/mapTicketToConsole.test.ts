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
  it('defaults nullish difficulty without inventing severity', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        // @ts-expect-error intentional null regression coverage
        difficulty: null,
        initial_state: { title: 'Unrated finding' },
      }),
      trackSlug: 'grc',
    });

    expect(mapped.difficulty).toBe('medium');
    expect(mapped.severity).toBeUndefined();
  });

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

  it('uses scenario.displayTitle and keeps scenario_brief separate', () => {
    const brief =
      'Northwind needs a written control mapping for AC-2 across SOC 2 and ISO 27001 with partial-overlap analysis.';
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        ticket_type: 'control_mapping',
        scenario_brief: brief,
        initial_state: {
          scenario: { displayTitle: 'Cross-framework control mapping' },
        },
      }),
      trackSlug: 'grc',
    });

    expect(mapped.title).toBe('Cross-framework control mapping');
    expect(mapped.scenarioBrief).toBe(brief);
  });

  it('does not fall back to a long scenario_brief for the console title', () => {
    const brief =
      'HarborNet CMS shipped an AC-2 implementation statement for the draft SSP. Judge whether the statement is adequate.';
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        ticket_type: 'control_implementation_adequacy',
        scenario_brief: brief,
        initial_state: {},
      }),
      trackSlug: 'grc',
    });

    expect(mapped.title).toBe('Control Implementation Adequacy');
    expect(mapped.scenarioBrief).toBe(brief);
    expect(mapped.title).not.toBe(brief);
  });

  it('derives control family from controlId and maps tier', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        tier: 2,
        ticket_type: 'assessment_procedures',
        initial_state: {
          title: 'SP 800-53A assessment procedure lab',
          controlId: 'ia-5.1',
        },
      }),
      trackSlug: 'grc',
    });

    expect(mapped.controlId).toBe('ia-5.1');
    expect(mapped.controlFamily).toBe('Identification & Authentication');
    expect(mapped.tier).toBe(2);
  });

  it('uses ticket-type family defaults when control fields are absent', () => {
    const mapped = mapTicketToConsoleTicket({
      ticket: makeTicket({
        ticket_type: 'tool_walkthrough',
        initial_state: { title: 'SP 800-30 risk assessment via SimpleRisk' },
      }),
      trackSlug: 'grc',
    });

    expect(mapped.controlFamily).toBe('Risk Assessment');
  });
});
