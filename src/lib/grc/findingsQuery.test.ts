import { describe, expect, it } from 'vitest';

import {
  countFindingsFacets,
  filterFindings,
  parseFindingsQuery,
  serializeFindingsQuery,
  sortFindings,
  paginateFindings,
  type FindingsQueryState,
} from '@/lib/grc/findingsQuery';
import type { MockTrackTicket } from '@/types';

function ticket(
  overrides: Partial<MockTrackTicket> & Pick<MockTrackTicket, 'id' | 'title'>
): MockTrackTicket {
  return {
    trackSlug: 'grc',
    ticketType: 'poam',
    difficulty: 'medium',
    slaMinutes: 30,
    startedAt: null,
    status: 'new',
    sortOrder: 1,
    ...overrides,
  };
}

const sample: MockTrackTicket[] = [
  ticket({
    id: '1',
    title: 'AC-2 privileged review',
    controlId: 'AC-2',
    controlFamily: 'Access Control',
    ticketType: 'control_mapping',
    status: 'new',
    severity: 'high',
    difficulty: 'medium',
    tier: 2,
    sortOrder: 1,
  }),
  ticket({
    id: '2',
    title: 'IA-5 assessment procedures',
    controlId: 'IA-5',
    controlFamily: 'Identification & Authentication',
    ticketType: 'assessment_procedures',
    status: 'resolved',
    severity: 'medium',
    difficulty: 'hard',
    tier: 2,
    sortOrder: 2,
  }),
  ticket({
    id: '3',
    title: 'ConMon strategy',
    controlFamily: 'Assessment & Authorization',
    ticketType: 'conmon_strategy',
    status: 'in_progress',
    difficulty: 'hard',
    tier: 3,
    sortOrder: 3,
  }),
];

describe('parseFindingsQuery / serializeFindingsQuery', () => {
  it('round-trips non-default filter state', () => {
    const state: FindingsQueryState = {
      q: 'AC-2',
      status: ['new', 'in_progress'],
      severity: ['high'],
      difficulty: ['medium'],
      family: ['Access Control'],
      tier: [2],
      hideCompleted: true,
      groupByFamily: true,
      sort: 'severity',
      dir: 'desc',
      page: 2,
      pageSize: 20,
    };
    const params = serializeFindingsQuery(state);
    expect(params.get('q')).toBe('AC-2');
    expect(params.get('hideCompleted')).toBe('1');
    expect(params.get('group')).toBe('family');
    expect(parseFindingsQuery(params)).toEqual(state);
  });

  it('omits default values from the URL', () => {
    const params = serializeFindingsQuery({
      q: '',
      status: [],
      severity: [],
      difficulty: [],
      family: [],
      tier: [],
      hideCompleted: false,
      groupByFamily: false,
      sort: 'title',
      dir: 'asc',
      page: 1,
      pageSize: 20,
    });
    expect(params.toString()).toBe('');
  });
});

describe('filterFindings', () => {
  it('searches title, control id, and ticket type', () => {
    const state = parseFindingsQuery(
      new URLSearchParams('q=assessment%20procedures')
    );
    expect(filterFindings(sample, state).map((t) => t.id)).toEqual(['2']);

    const byControl = parseFindingsQuery(new URLSearchParams('q=AC-2'));
    expect(filterFindings(sample, byControl).map((t) => t.id)).toEqual(['1']);

    const byType = parseFindingsQuery(new URLSearchParams('q=conmon_strategy'));
    expect(filterFindings(sample, byType).map((t) => t.id)).toEqual(['3']);
  });

  it('hides completed tickets when hideCompleted is set', () => {
    const state = parseFindingsQuery(new URLSearchParams('hideCompleted=1'));
    expect(filterFindings(sample, state).map((t) => t.id)).toEqual(['1', '3']);
  });

  it('applies multi-select status and family chips', () => {
    const state = parseFindingsQuery(
      new URLSearchParams('status=new,in_progress&family=Access%20Control')
    );
    expect(filterFindings(sample, state).map((t) => t.id)).toEqual(['1']);
  });
});

describe('sortFindings', () => {
  it('sorts by severity with direction', () => {
    const desc = sortFindings(sample, 'severity', 'desc');
    expect(desc.map((t) => t.id)).toEqual(['1', '2', '3']);

    const asc = sortFindings(sample, 'severity', 'asc');
    expect(asc.map((t) => t.id)).toEqual(['3', '2', '1']);
  });

  it('sorts by title', () => {
    const sorted = sortFindings(sample, 'title', 'asc');
    expect(sorted.map((t) => t.title)).toEqual([
      'AC-2 privileged review',
      'ConMon strategy',
      'IA-5 assessment procedures',
    ]);
  });
});

describe('paginateFindings', () => {
  it('pages results and clamps out-of-range pages', () => {
    const page1 = paginateFindings(sample, 1, 2);
    expect(page1.pageItems.map((t) => t.id)).toEqual(['1', '2']);
    expect(page1.totalPages).toBe(2);

    const page3 = paginateFindings(sample, 9, 2);
    expect(page3.page).toBe(2);
    expect(page3.pageItems.map((t) => t.id)).toEqual(['3']);
  });
});

describe('countFindingsFacets', () => {
  it('counts status facets against other active filters', () => {
    const state = parseFindingsQuery(new URLSearchParams('hideCompleted=1'));
    const facets = countFindingsFacets(sample, state);
    expect(facets.status.new).toBe(1);
    expect(facets.status.in_progress).toBe(1);
    expect(facets.status.resolved).toBe(0);
    expect(facets.family['Access Control']).toBe(1);
  });
});
