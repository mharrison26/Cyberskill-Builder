import { isClosedTicketStatus } from '@/lib/tickets/status';
import type { MockTrackTicket, TicketProgressStatus } from '@/types';

export const FINDINGS_PAGE_SIZE = 20;

export type FindingsSortKey =
  | 'title'
  | 'control'
  | 'difficulty'
  | 'severity'
  | 'poamDue'
  | 'status'
  | 'family';

export type FindingsQueryState = {
  q: string;
  status: TicketProgressStatus[];
  severity: Array<'critical' | 'high' | 'medium' | 'low'>;
  difficulty: string[];
  family: string[];
  tier: number[];
  hideCompleted: boolean;
  groupByFamily: boolean;
  sort: FindingsSortKey;
  dir: 'asc' | 'desc';
  page: number;
  pageSize: number;
};

export const DEFAULT_FINDINGS_QUERY: FindingsQueryState = {
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
  pageSize: FINDINGS_PAGE_SIZE,
};

const SORT_KEYS: FindingsSortKey[] = [
  'title',
  'control',
  'difficulty',
  'severity',
  'poamDue',
  'status',
  'family',
];

const STATUS_VALUES: TicketProgressStatus[] = [
  'new',
  'in_progress',
  'resolved',
  'reviewed',
];

const SEVERITY_VALUES = ['critical', 'high', 'medium', 'low'] as const;

function splitCsv(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseSortKey(value: string | null): FindingsSortKey {
  if (value && (SORT_KEYS as string[]).includes(value)) {
    return value as FindingsSortKey;
  }
  return DEFAULT_FINDINGS_QUERY.sort;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isTruthyParam(value: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Parse shareable console filters from URLSearchParams. */
export function parseFindingsQuery(
  params: URLSearchParams | ReadonlyURLSearchParams
): FindingsQueryState {
  const status = splitCsv(params.get('status')).filter(
    (v): v is TicketProgressStatus => (STATUS_VALUES as string[]).includes(v)
  );
  const severity = splitCsv(params.get('severity')).filter(
    (v): v is FindingsQueryState['severity'][number] =>
      (SEVERITY_VALUES as readonly string[]).includes(v)
  );
  const difficulty = splitCsv(params.get('difficulty')).map((v) =>
    v.toLowerCase()
  );
  const family = splitCsv(params.get('family'));
  const tier = splitCsv(params.get('tier'))
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => n === 1 || n === 2 || n === 3);

  const groupParam = params.get('group');
  const groupByFamily =
    groupParam === null
      ? DEFAULT_FINDINGS_QUERY.groupByFamily
      : groupParam === 'family' || isTruthyParam(groupParam);

  return {
    q: (params.get('q') ?? '').trim(),
    status,
    severity,
    difficulty,
    family,
    tier,
    hideCompleted: isTruthyParam(params.get('hideCompleted')),
    groupByFamily,
    sort: parseSortKey(params.get('sort')),
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: parsePositiveInt(params.get('page'), 1),
    pageSize: parsePositiveInt(
      params.get('pageSize'),
      DEFAULT_FINDINGS_QUERY.pageSize
    ),
  };
}

type ReadonlyURLSearchParams = {
  get(name: string): string | null;
};

/** Serialize query state to URLSearchParams (omit defaults). */
export function serializeFindingsQuery(
  state: FindingsQueryState
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.status.length) params.set('status', state.status.join(','));
  if (state.severity.length) params.set('severity', state.severity.join(','));
  if (state.difficulty.length)
    params.set('difficulty', state.difficulty.join(','));
  if (state.family.length) params.set('family', state.family.join(','));
  if (state.tier.length) params.set('tier', state.tier.join(','));
  if (state.hideCompleted) params.set('hideCompleted', '1');
  if (state.groupByFamily) params.set('group', 'family');
  if (state.sort !== DEFAULT_FINDINGS_QUERY.sort)
    params.set('sort', state.sort);
  if (state.dir !== DEFAULT_FINDINGS_QUERY.dir) params.set('dir', state.dir);
  if (state.page > 1) params.set('page', String(state.page));
  if (state.pageSize !== DEFAULT_FINDINGS_QUERY.pageSize) {
    params.set('pageSize', String(state.pageSize));
  }
  return params;
}

export function findingsQueryHasFilters(state: FindingsQueryState): boolean {
  return Boolean(
    state.q ||
    state.status.length ||
    state.severity.length ||
    state.difficulty.length ||
    state.family.length ||
    state.tier.length ||
    state.hideCompleted
  );
}

function matchesSearch(ticket: MockTrackTicket, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystacks = [
    ticket.title,
    ticket.controlId,
    ticket.ticketType,
    ticket.ticketType.replace(/_/g, ' '),
    ticket.subtitle,
    ticket.controlFamily,
  ];
  return haystacks.some((value) =>
    (value ?? '').toLowerCase().includes(needle)
  );
}

function severityRank(value: MockTrackTicket['severity'] | undefined): number {
  switch (value) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function statusRank(status: TicketProgressStatus): number {
  return STATUS_VALUES.indexOf(status);
}

function difficultyRank(difficulty: string): number {
  switch (difficulty.trim().toLowerCase()) {
    case 'critical':
    case 'hard':
      return 4;
    case 'high':
      return 3;
    case 'medium':
    case 'moderate':
      return 2;
    case 'easy':
    case 'low':
      return 1;
    default:
      return 0;
  }
}

export type FindingsFilterOptions = {
  /** When set, only apply these dimensions (used for facet counts). */
  ignore?: Array<
    | 'status'
    | 'severity'
    | 'difficulty'
    | 'family'
    | 'tier'
    | 'hideCompleted'
    | 'q'
  >;
};

/** Apply search + facet filters (no sort/pagination). */
export function filterFindings(
  tickets: MockTrackTicket[],
  state: FindingsQueryState,
  options: FindingsFilterOptions = {}
): MockTrackTicket[] {
  const ignore = new Set(options.ignore ?? []);

  return tickets.filter((ticket) => {
    if (!ignore.has('q') && !matchesSearch(ticket, state.q)) return false;

    if (!ignore.has('hideCompleted') && state.hideCompleted) {
      if (isClosedTicketStatus(ticket.status)) return false;
    }

    if (!ignore.has('status') && state.status.length > 0) {
      if (!state.status.includes(ticket.status)) return false;
    }

    if (!ignore.has('severity') && state.severity.length > 0) {
      if (!ticket.severity || !state.severity.includes(ticket.severity)) {
        return false;
      }
    }

    if (!ignore.has('difficulty') && state.difficulty.length > 0) {
      const d = ticket.difficulty.trim().toLowerCase();
      if (!state.difficulty.includes(d)) return false;
    }

    if (!ignore.has('family') && state.family.length > 0) {
      const family = ticket.controlFamily ?? 'Uncategorized';
      if (!state.family.includes(family)) return false;
    }

    if (!ignore.has('tier') && state.tier.length > 0) {
      if (ticket.tier == null || !state.tier.includes(ticket.tier)) {
        return false;
      }
    }

    return true;
  });
}

export function sortFindings(
  tickets: MockTrackTicket[],
  sort: FindingsSortKey,
  dir: 'asc' | 'desc'
): MockTrackTicket[] {
  const mult = dir === 'asc' ? 1 : -1;
  return [...tickets].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case 'title':
        cmp = a.title.localeCompare(b.title, undefined, {
          sensitivity: 'base',
        });
        break;
      case 'control':
        cmp = (a.controlId ?? '').localeCompare(b.controlId ?? '', undefined, {
          sensitivity: 'base',
        });
        break;
      case 'difficulty':
        cmp = difficultyRank(a.difficulty) - difficultyRank(b.difficulty);
        break;
      case 'severity':
        cmp = severityRank(a.severity) - severityRank(b.severity);
        break;
      case 'poamDue': {
        const aTime = a.poamDueAt
          ? Date.parse(a.poamDueAt)
          : Number.POSITIVE_INFINITY;
        const bTime = b.poamDueAt
          ? Date.parse(b.poamDueAt)
          : Number.POSITIVE_INFINITY;
        cmp = aTime - bTime;
        break;
      }
      case 'status':
        cmp = statusRank(a.status) - statusRank(b.status);
        break;
      case 'family':
        cmp = (a.controlFamily ?? 'Uncategorized').localeCompare(
          b.controlFamily ?? 'Uncategorized',
          undefined,
          { sensitivity: 'base' }
        );
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) return cmp * mult;
    return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  });
}

export function paginateFindings<T>(
  items: T[],
  page: number,
  pageSize: number
): { pageItems: T[]; page: number; totalPages: number; total: number } {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}

export function groupFindingsByControlFamily(
  tickets: MockTrackTicket[]
): Array<{ family: string; tickets: MockTrackTicket[] }> {
  const map = new Map<string, MockTrackTicket[]>();
  for (const ticket of tickets) {
    const family = ticket.controlFamily ?? 'Uncategorized';
    const list = map.get(family) ?? [];
    list.push(ticket);
    map.set(family, list);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, rows]) => ({ family, tickets: rows }));
}

export type FindingsFacetCounts = {
  status: Record<TicketProgressStatus, number>;
  severity: Record<'critical' | 'high' | 'medium' | 'low', number>;
  difficulty: Record<string, number>;
  family: Record<string, number>;
  tier: Record<number, number>;
};

/** Facet counts respecting other active filters (classic faceted search). */
export function countFindingsFacets(
  tickets: MockTrackTicket[],
  state: FindingsQueryState
): FindingsFacetCounts {
  const status = Object.fromEntries(STATUS_VALUES.map((s) => [s, 0])) as Record<
    TicketProgressStatus,
    number
  >;
  const severity = Object.fromEntries(
    SEVERITY_VALUES.map((s) => [s, 0])
  ) as FindingsFacetCounts['severity'];
  const difficulty: Record<string, number> = {};
  const family: Record<string, number> = {};
  const tier: Record<number, number> = {};

  const forStatus = filterFindings(tickets, state, {
    ignore: ['status'],
  });
  for (const ticket of forStatus) status[ticket.status] += 1;

  const forSeverity = filterFindings(tickets, state, {
    ignore: ['severity'],
  });
  for (const ticket of forSeverity) {
    if (ticket.severity) severity[ticket.severity] += 1;
  }

  const forDifficulty = filterFindings(tickets, state, {
    ignore: ['difficulty'],
  });
  for (const ticket of forDifficulty) {
    const key = ticket.difficulty.trim().toLowerCase() || 'unknown';
    difficulty[key] = (difficulty[key] ?? 0) + 1;
  }

  const forFamily = filterFindings(tickets, state, {
    ignore: ['family'],
  });
  for (const ticket of forFamily) {
    const key = ticket.controlFamily ?? 'Uncategorized';
    family[key] = (family[key] ?? 0) + 1;
  }

  const forTier = filterFindings(tickets, state, {
    ignore: ['tier'],
  });
  for (const ticket of forTier) {
    if (ticket.tier == null) continue;
    tier[ticket.tier] = (tier[ticket.tier] ?? 0) + 1;
  }

  return { status, severity, difficulty, family, tier };
}

export function toggleListValue<T extends string | number>(
  list: T[],
  value: T
): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}
