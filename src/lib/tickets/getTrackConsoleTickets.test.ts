import { describe, expect, it } from 'vitest';

import { getTrackConsoleTickets } from '@/lib/tickets/getTrackConsoleTickets';

type Row = Record<string, unknown>;

type TableResult = {
  list?: { data: Row[] | null; error: { message: string } | null };
  single?: { data: Row | null; error: { message: string } | null };
};

/**
 * Minimal thenable query builder that records .eq filters and returns
 * configured table results. Enough to exercise getTrackConsoleTickets.
 */
function createMockSupabase(tables: Record<string, TableResult>) {
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

  function from(table: string) {
    const result = tables[table] ?? {
      list: { data: [], error: null },
      single: { data: null, error: null },
    };
    const filters: Array<{ column: string; value: unknown }> = [];

    const builder: {
      select: () => typeof builder;
      eq: (column: string, value: unknown) => typeof builder;
      in: () => typeof builder;
      order: () => typeof builder;
      maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
      then: (
        onfulfilled?: (value: {
          data: Row[] | null;
          error: unknown;
        }) => unknown,
        onrejected?: (reason: unknown) => unknown
      ) => Promise<unknown>;
    } = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push({ column, value });
        eqCalls.push({ table, column, value });
        return builder;
      },
      in() {
        return builder;
      },
      order() {
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(result.single ?? { data: null, error: null });
      },
      then(onfulfilled, onrejected) {
        let rows = result.list?.data ?? [];
        const tenantFilter = filters.find((f) => f.column === 'tenant_id');
        if (tenantFilter && Array.isArray(rows)) {
          rows = rows.filter((row) => row.tenant_id === tenantFilter.value);
        }
        const trackFilter = filters.find((f) => f.column === 'track_id');
        if (trackFilter && Array.isArray(rows)) {
          rows = rows.filter((row) => row.track_id === trackFilter.value);
        }
        return Promise.resolve({
          data: rows,
          error: result.list?.error ?? null,
        }).then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  return {
    client: { from } as unknown as Parameters<typeof getTrackConsoleTickets>[0],
    eqCalls,
  };
}

function ticketRow(
  overrides: Partial<Row> & { id: string; ticket_type: string }
): Row {
  return {
    tenant_id: 'tenant-a',
    track_id: 'track-grc',
    tier: 2,
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: overrides.ticket_type,
    initial_state: {
      title: overrides.ticket_type,
      sheetId: overrides.ticket_type,
    },
    expected_state: {},
    dcwf_code: '722',
    sort_order: 10,
    engagement_id: null,
    engagement_stage: null,
    ...overrides,
  };
}

describe('getTrackConsoleTickets', () => {
  it('returns unique scenarios per tenant when both tenant copies exist', async () => {
    const trackId = 'track-grc';
    const studentId = 'student-1';
    const tenantA = '00000000-0000-4000-8000-000000000001';
    const tenantB = '00000000-0000-4000-8000-000000000003';

    const crossTenantRows = [
      ticketRow({
        id: 't-poam-a',
        ticket_type: 'poam',
        tenant_id: tenantA,
        track_id: trackId,
        sort_order: 25,
      }),
      ticketRow({
        id: 't-poam-b',
        ticket_type: 'poam',
        tenant_id: tenantB,
        track_id: trackId,
        sort_order: 25,
      }),
      ticketRow({
        id: 't-conmon-a',
        ticket_type: 'conmon_strategy',
        tenant_id: tenantA,
        track_id: trackId,
        sort_order: 30,
      }),
      ticketRow({
        id: 't-conmon-b',
        ticket_type: 'conmon_strategy',
        tenant_id: tenantB,
        track_id: trackId,
        sort_order: 30,
      }),
    ];

    const { client, eqCalls } = createMockSupabase({
      tracks: {
        single: {
          data: { id: trackId, slug: 'grc', name: 'GRC' },
          error: null,
        },
      },
      users: {
        single: {
          data: { tenant_id: tenantA },
          error: null,
        },
      },
      track_enrollments: {
        single: {
          data: { id: 'enroll-1' },
          error: null,
        },
      },
      tickets: {
        list: { data: crossTenantRows, error: null },
      },
      ticket_progress: {
        list: { data: [], error: null },
      },
    });

    const result = await getTrackConsoleTickets(client, 'grc', studentId);

    expect(eqCalls).toContainEqual({
      table: 'tickets',
      column: 'tenant_id',
      value: tenantA,
    });
    expect(result.source).toBe('live');
    expect(result.tickets).toHaveLength(2);

    const types = result.tickets.map((t) => t.ticketType);
    expect(types).toEqual(['poam', 'conmon_strategy']);
    expect(new Set(types).size).toBe(types.length);

    const ids = result.tickets.map((t) => t.id);
    expect(ids).toEqual(['t-poam-a', 't-conmon-a']);
    expect(ids).not.toContain('t-poam-b');
    expect(ids).not.toContain('t-conmon-b');
  });

  it('does not surface duplicate ticket_type rows in the console payload', async () => {
    const trackId = 'track-grc';
    const tenantA = 'tenant-a';

    const { client } = createMockSupabase({
      tracks: {
        single: {
          data: { id: trackId, slug: 'grc', name: 'GRC' },
          error: null,
        },
      },
      users: {
        single: { data: { tenant_id: tenantA }, error: null },
      },
      track_enrollments: {
        single: { data: { id: 'enroll-1' }, error: null },
      },
      tickets: {
        list: {
          data: [
            ticketRow({
              id: 'a',
              ticket_type: 'control_mapping',
              tenant_id: tenantA,
              track_id: trackId,
              sort_order: 1,
            }),
            ticketRow({
              id: 'b',
              ticket_type: 'tool_walkthrough',
              tenant_id: tenantA,
              track_id: trackId,
              sort_order: 2,
            }),
            ticketRow({
              id: 'c',
              ticket_type: 'assessment_procedures',
              tenant_id: tenantA,
              track_id: trackId,
              sort_order: 3,
            }),
            // Same-tenant duplicate scenario (pre-unique-index residue)
            ticketRow({
              id: 'a-dup',
              ticket_type: 'control_mapping',
              tenant_id: tenantA,
              track_id: trackId,
              sort_order: 4,
            }),
          ],
          error: null,
        },
      },
      ticket_progress: {
        list: { data: [], error: null },
      },
    });

    const result = await getTrackConsoleTickets(client, 'grc', 'student-1');
    const types = result.tickets.map((t) => t.ticketType);

    expect(result.tickets).toHaveLength(3);
    expect(new Set(types).size).toBe(types.length);
    expect(result.tickets.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
