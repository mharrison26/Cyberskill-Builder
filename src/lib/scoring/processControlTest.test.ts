import { describe, expect, it } from 'vitest';

import {
  evaluateProcessControlTestDeterministic,
  parseProcessControlSampleItems,
  processControlTestTicketScorer,
} from '@/lib/scoring/processControlTest';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-pct-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'process_control_test',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'Test AP three-way match exceptions.',
    initial_state: {
      controlObjective:
        'Invoices are approved and matched to PO and receipt before payment.',
      sampleItems: [
        {
          id: 'inv-100',
          label: 'Acme supplies',
          vendor: 'Acme',
          approvalStatus: 'approved',
          matchStatus: 'matched',
        },
        {
          id: 'inv-200',
          label: 'Missing PO match',
          vendor: 'Northwind',
          approvalStatus: 'approved',
          matchStatus: 'no_po',
        },
        {
          id: 'inv-300',
          label: 'Unapproved invoice',
          vendor: 'Contoso',
          approvalStatus: 'pending',
          matchStatus: 'matched',
        },
      ],
    },
    expected_state: {
      controlOutcome: 'fail',
      exceptionItemIds: ['inv-200', 'inv-300'],
      minNotesLength: 40,
    },
    dcwf_code: '612',
    sort_order: 2,
    ...overrides,
  };
}

const notes =
  'Sampled three AP invoices; two failed three-way match or approval checks.';

describe('processControlTest', () => {
  it('registers process_control_test aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('process_control_test');
    expect(registered).toContain('control_sample_test');
    expect(getTicketScorer('process_control_test')).toBeTruthy();
  });

  it('parses sample items', () => {
    const items = parseProcessControlSampleItems(ticket().initial_state);
    expect(items).toHaveLength(3);
    expect(items[1]?.attributes.matchStatus).toBe('no_po');
  });

  it('requires exact exception set and outcome', () => {
    const wrong = evaluateProcessControlTestDeterministic(
      {
        controlOutcome: 'pass',
        exceptionItemIds: [],
        notes,
      },
      ticket()
    );
    expect(wrong.ok).toBe(false);

    const partial = evaluateProcessControlTestDeterministic(
      {
        controlOutcome: 'fail',
        exceptionItemIds: ['inv-200'],
        notes,
      },
      ticket()
    );
    expect(partial.ok).toBe(false);
    expect(partial.structured.missingExceptionItemIds).toContain('inv-300');
  });

  it('resolves correct pass/fail + exceptions', async () => {
    const submission = {
      type: 'process_control_test',
      controlOutcome: 'fail' as const,
      exceptionItemIds: ['inv-300', 'inv-200'],
      notes,
    };
    const scored = await processControlTestTicketScorer.score(
      submission,
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.exceptionSetMatch).toBe(true);
  });
});
