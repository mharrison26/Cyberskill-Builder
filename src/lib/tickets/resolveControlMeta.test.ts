import { describe, expect, it } from 'vitest';

import { resolveConsoleControlMeta } from '@/lib/tickets/resolveControlMeta';

describe('resolveConsoleControlMeta', () => {
  it('derives family label from controlId', () => {
    expect(
      resolveConsoleControlMeta({
        ticketType: 'assessment_procedures',
        initialState: { controlId: 'ia-5.1' },
      })
    ).toEqual({
      controlId: 'ia-5.1',
      controlFamily: 'Identification & Authentication',
    });
  });

  it('uses source_control_id for control_mapping', () => {
    expect(
      resolveConsoleControlMeta({
        ticketType: 'control_mapping',
        initialState: { source_control_id: 'AC-2' },
      })
    ).toEqual({
      controlId: 'AC-2',
      controlFamily: 'Access Control',
    });
  });

  it('falls back to ticket-type defaults when state omits control fields', () => {
    expect(
      resolveConsoleControlMeta({
        ticketType: 'tool_walkthrough',
        initialState: {},
      })
    ).toEqual({
      controlId: undefined,
      controlFamily: 'Risk Assessment',
    });
  });

  it('prefers explicit control_family over defaults', () => {
    expect(
      resolveConsoleControlMeta({
        ticketType: 'poam',
        initialState: { control_family: 'AU' },
      })
    ).toEqual({
      controlId: undefined,
      controlFamily: 'Audit & Accountability',
    });
  });
});
