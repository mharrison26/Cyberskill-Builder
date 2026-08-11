'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Radio,
  Search,
  X,
} from 'lucide-react';

import { GlossaryTerm } from '@/components/glossary/GlossaryTerm';
import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { SeverityBadge } from '@/components/tickets/SeverityBadge';
import { TicketRow, toTicketRowData } from '@/components/tickets/TicketRow';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScenarioProse } from '@/components/ui/scenario-prose';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusDot } from '@/components/ui/status-dot';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSharedSlaClock } from '@/hooks/useTicketSlaCountdown';
import { useTrackTickets } from '@/hooks/useTrackTickets';
import {
  countFindingsFacets,
  filterFindings,
  findingsQueryHasFilters,
  groupFindingsByControlFamily,
  paginateFindings,
  parseFindingsQuery,
  serializeFindingsQuery,
  sortFindings,
  toggleListValue,
  type FindingsQueryState,
  type FindingsSortKey,
} from '@/lib/grc/findingsQuery';
import { MOCK_CONTROLS } from '@/lib/mock-data';
import {
  countOpenBySeverity,
  FINDING_SEVERITY_ORDER,
  isFindingSeverity,
} from '@/lib/tickets/openBySeverity';
import { needsLiveSlaCountdown } from '@/lib/tickets/sla';
import {
  isClosedTicketStatus,
  isOpenTicketStatus,
  TICKET_STATUS_LABELS,
} from '@/lib/tickets/status';
import type { MockTrackTicket, TicketProgressStatus } from '@/types';
import { cn } from '@/lib/utils';

type GrcComplianceConsoleProps = {
  trackSlug?: string;
  trackName?: string;
  initialTickets?: import('@/types').MockTrackTicket[];
  initialSource?: 'live' | 'mock' | 'mixed';
};

function difficultyTone(difficulty: string | null | undefined): {
  badge: string;
  dot: string;
} {
  switch ((difficulty ?? '').trim().toLowerCase()) {
    case 'hard':
    case 'critical':
    case 'high':
      return {
        badge:
          'bg-status-blocked text-status-blocked-foreground border-status-blocked-foreground/20',
        dot: 'bg-status-blocked-foreground',
      };
    case 'medium':
    case 'moderate':
      return {
        badge:
          'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20',
        dot: 'bg-status-insufficient-foreground',
      };
    case 'easy':
    case 'low':
    default:
      return {
        badge:
          'bg-status-not-started text-status-not-started-foreground border-status-not-started-foreground/20',
        dot: 'bg-status-not-started-foreground',
      };
  }
}

function formatDifficultyLabel(difficulty: string | null | undefined): string {
  const key = (difficulty ?? '').trim().toLowerCase();
  if (key === 'easy') return 'Easy';
  if (key === 'medium' || key === 'moderate') return 'Medium';
  if (key === 'hard') return 'Hard';
  if (!key) return '—';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function DifficultyBadge({
  difficulty,
}: {
  difficulty: string | null | undefined;
}) {
  const tone = difficultyTone(difficulty);
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 gap-1.5 rounded-md px-2 py-0 font-mono text-overline uppercase font-normal',
        tone.badge
      )}
    >
      <StatusDot className={tone.dot} />
      <span>{formatDifficultyLabel(difficulty)}</span>
    </Badge>
  );
}

/** Dedupe by id so the header count matches the rows that render. */
function dedupeFindings(tickets: MockTrackTicket[]): MockTrackTicket[] {
  const seen = new Set<string>();
  const rows: MockTrackTicket[] = [];
  for (const ticket of tickets) {
    if (seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    rows.push(ticket);
  }
  return rows;
}

function formatLedgerDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function activationLabel(ticket: MockTrackTicket): string {
  if (ticket.workbenchHref) {
    return `Open workbench: ${ticket.title}`;
  }
  return `Select ticket: ${ticket.title}`;
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums opacity-80">{count}</span>
    </button>
  );
}

/**
 * GRC assessor/compliance dashboard — dense audit-log table, ConMon stats,
 * and a control-catalog quick-reference. Distinct from ISSO ops and ISSM
 * program oversight; layout is GRC-specific (not a themed shared shell).
 */
export function GrcComplianceConsole({
  trackSlug = 'grc',
  trackName = 'GRC',
  initialTickets,
  initialSource,
}: GrcComplianceConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { tickets, setTicketStatus, source } = useTrackTickets(trackSlug, {
    initialTickets,
    initialSource,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useMemo(
    () => parseFindingsQuery(searchParams),
    [searchParams]
  );
  const [searchDraft, setSearchDraft] = useState(query.q);

  useEffect(() => {
    setSearchDraft(query.q);
  }, [query.q]);

  const replaceQuery = useCallback(
    (patch: Partial<FindingsQueryState>) => {
      const next: FindingsQueryState = { ...query, ...patch };
      const params = serializeFindingsQuery(next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, query, router]
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const next = searchDraft.trim();
      if (next === query.q) return;
      replaceQuery({ q: next, page: 1 });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [searchDraft, query.q, replaceQuery]);

  const needsTick = tickets.some((t) =>
    needsLiveSlaCountdown(t.startedAt, {
      resolvedAt: t.resolvedAt,
      slaMet: t.slaMet,
      closed: isClosedTicketStatus(t.status),
    })
  );
  const nowMs = useSharedSlaClock(needsTick);

  /** Single source of truth for table rows + header count (post-dedupe). */
  const findings = useMemo(() => dedupeFindings(tickets), [tickets]);

  const selected = findings.find((t) => t.id === selectedId) ?? null;
  /** Detail pane only for tickets that cannot navigate to a workbench. */
  const detailTicket =
    selected && !selected.workbenchHref ? selected : null;

  const {
    counts: openBySeverity,
    openTotal: openCount,
    unrated: unratedOpenCount,
  } = useMemo(() => countOpenBySeverity(findings), [findings]);

  const poamDueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return findings.filter((t) => {
      if (!t.poamDueAt || !isOpenTicketStatus(t.status)) return false;
      const due = new Date(t.poamDueAt);
      return (
        !Number.isNaN(due.getTime()) &&
        due.getTime() <= today.getTime() + 14 * 86_400_000
      );
    }).length;
  }, [findings]);

  const conmonStatus = useMemo(() => {
    const overduePoam = findings.filter((t) => {
      if (!t.poamDueAt || !isOpenTicketStatus(t.status)) return false;
      return new Date(t.poamDueAt).getTime() < Date.now();
    }).length;
    if (overduePoam > 0) return { label: 'At risk', tone: 'blocked' as const };
    if (openCount > 3)
      return { label: 'Monitoring', tone: 'insufficient' as const };
    return { label: 'Green', tone: 'satisfied' as const };
  }, [findings, openCount]);

  const filtered = useMemo(
    () => filterFindings(findings, query),
    [findings, query]
  );
  const sorted = useMemo(
    () => sortFindings(filtered, query.sort, query.dir),
    [filtered, query.sort, query.dir]
  );
  const paged = useMemo(
    () => paginateFindings(sorted, query.page, query.pageSize),
    [sorted, query.page, query.pageSize]
  );

  useEffect(() => {
    if (paged.page !== query.page) {
      replaceQuery({ page: paged.page });
    }
  }, [paged.page, query.page, replaceQuery]);

  const groups = useMemo(() => {
    if (!query.groupByFamily) {
      return [{ family: null as string | null, tickets: paged.pageItems }];
    }
    return groupFindingsByControlFamily(paged.pageItems).map((g) => ({
      family: g.family,
      tickets: g.tickets,
    }));
  }, [paged.pageItems, query.groupByFamily]);

  const facets = useMemo(
    () => countFindingsFacets(findings, query),
    [findings, query]
  );

  const hasFilters = findingsQueryHasFilters(query);

  const difficultyOptions = useMemo(
    () =>
      Object.keys(facets.difficulty).sort((a, b) => a.localeCompare(b)),
    [facets.difficulty]
  );
  const familyOptions = useMemo(
    () => Object.keys(facets.family).sort((a, b) => a.localeCompare(b)),
    [facets.family]
  );
  const tierOptions = useMemo(
    () =>
      Object.keys(facets.tier)
        .map((k) => Number(k))
        .sort((a, b) => a - b),
    [facets.tier]
  );

  function activateTicket(ticket: MockTrackTicket) {
    if (ticket.workbenchHref) {
      router.push(ticket.workbenchHref);
      return;
    }
    setSelectedId(ticket.id);
  }

  function onRowKeyDown(
    event: KeyboardEvent<HTMLTableRowElement>,
    ticket: MockTrackTicket
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateTicket(ticket);
    }
  }

  function clearFilters() {
    replaceQuery({
      q: '',
      status: [],
      severity: [],
      difficulty: [],
      family: [],
      tier: [],
      hideCompleted: false,
      page: 1,
    });
    setSearchDraft('');
  }

  function cycleSort(key: FindingsSortKey) {
    if (query.sort === key) {
      replaceQuery({ dir: query.dir === 'asc' ? 'desc' : 'asc' });
      return;
    }
    replaceQuery({ sort: key, dir: 'asc', page: 1 });
  }

  function ariaSortFor(
    key: FindingsSortKey
  ): 'none' | 'ascending' | 'descending' {
    if (query.sort !== key) return 'none';
    return query.dir === 'asc' ? 'ascending' : 'descending';
  }

  function SortHeader({
    sortKey,
    label,
    className,
  }: {
    sortKey: FindingsSortKey;
    label: string;
    className?: string;
  }) {
    const active = query.sort === sortKey;
    return (
      <TableHead
        scope="col"
        aria-sort={ariaSortFor(sortKey)}
        className={className}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
          onClick={() => cycleSort(sortKey)}
        >
          {label}
          {active ? (
            query.dir === 'asc' ? (
              <ArrowUp className="size-3.5 opacity-70" aria-hidden="true" />
            ) : (
              <ArrowDown className="size-3.5 opacity-70" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="size-3.5 opacity-40" aria-hidden="true" />
          )}
        </button>
      </TableHead>
    );
  }

  return (
    <div className="space-y-4">
      <SimulatedDataBanner />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {trackName} · Compliance operations
          </p>
          <h1 className="text-h1">Control assessment console</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Assessor findings and POA&amp;M items — search, filter, and open
            workbenches. Optional grouping by control family.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/catalog" />} variant="outline" size="sm">
            <BookOpen className="size-4" aria-hidden="true" />
            Full catalog
          </Button>
          <Button
            render={<Link href="/dashboard" />}
            variant="outline"
            size="sm"
          >
            Dashboard
          </Button>
        </div>
      </header>

      <section
        aria-label="Compliance summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {FINDING_SEVERITY_ORDER.map((sev) => (
          <div key={sev} className="border border-border bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Open · {sev}
            </p>
            <p className="mt-1 font-mono text-h2 tabular-nums">
              {openBySeverity[sev]}
            </p>
          </div>
        ))}
        <div className="border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Open · Unrated
          </p>
          <p className="mt-1 font-mono text-h2 tabular-nums">
            {unratedOpenCount}
          </p>
          <p className="mt-1 text-meta text-muted-foreground">
            Rated + unrated = {openCount} open
          </p>
        </div>
        <div className="border border-border bg-card px-4 py-3 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <GlossaryTerm id="poam">POA&amp;M</GlossaryTerm> due ≤ 14d
          </p>
          <p className="mt-1 font-mono text-h2 tabular-nums">{poamDueCount}</p>
        </div>
        <div className="border border-border bg-card px-4 py-3 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <GlossaryTerm id="conmon">ConMon</GlossaryTerm> status
          </p>
          <p className="mt-2">
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5 font-normal capitalize',
                conmonStatus.tone === 'satisfied' &&
                  'bg-status-satisfied text-status-satisfied-foreground border-status-satisfied-foreground/20',
                conmonStatus.tone === 'insufficient' &&
                  'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20',
                conmonStatus.tone === 'blocked' &&
                  'bg-status-blocked text-status-blocked-foreground border-status-blocked-foreground/20'
              )}
            >
              <Radio className="size-3.5" aria-hidden="true" />
              {conmonStatus.label}
            </Badge>
          </p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <section
          aria-labelledby="findings-log-heading"
          className="min-w-0 border border-border bg-card"
        >
          <div className="space-y-3 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="findings-log-heading" className="text-sm font-semibold">
                Findings / tickets
                {query.groupByFamily ? ' by control family' : null}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                {paged.total} match
                {paged.total === 1 ? '' : 'es'}
                {paged.total !== findings.length
                  ? ` · ${findings.length} total`
                  : null}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="relative max-w-xl">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Search title, control ID, or type…"
                  aria-label="Search findings"
                  className="pl-8"
                />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="hide-completed"
                    checked={query.hideCompleted}
                    onCheckedChange={(checked) =>
                      replaceQuery({
                        hideCompleted: Boolean(checked),
                        page: 1,
                      })
                    }
                    size="sm"
                  />
                  <Label htmlFor="hide-completed" className="text-xs">
                    Hide completed
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="group-by-family"
                    checked={query.groupByFamily}
                    onCheckedChange={(checked) =>
                      replaceQuery({ groupByFamily: Boolean(checked) })
                    }
                    size="sm"
                  />
                  <Label htmlFor="group-by-family" className="text-xs">
                    Group by control family
                  </Label>
                </div>
                {hasFilters ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={clearFilters}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    Clear filters
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2" aria-label="Finding filters">
                <div className="flex flex-wrap gap-1.5">
                  <span className="mr-1 self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </span>
                  {(
                    Object.keys(TICKET_STATUS_LABELS) as TicketProgressStatus[]
                  ).map((status) => (
                    <FilterChip
                      key={status}
                      label={TICKET_STATUS_LABELS[status]}
                      count={facets.status[status]}
                      active={query.status.includes(status)}
                      onClick={() =>
                        replaceQuery({
                          status: toggleListValue(query.status, status),
                          page: 1,
                        })
                      }
                    />
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className="mr-1 self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Severity
                  </span>
                  {FINDING_SEVERITY_ORDER.map((sev) => (
                    <FilterChip
                      key={sev}
                      label={sev}
                      count={facets.severity[sev]}
                      active={query.severity.includes(sev)}
                      onClick={() =>
                        replaceQuery({
                          severity: toggleListValue(query.severity, sev),
                          page: 1,
                        })
                      }
                    />
                  ))}
                </div>

                {difficultyOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="mr-1 self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Difficulty
                    </span>
                    {difficultyOptions.map((diff) => (
                      <FilterChip
                        key={diff}
                        label={formatDifficultyLabel(diff)}
                        count={facets.difficulty[diff] ?? 0}
                        active={query.difficulty.includes(diff)}
                        onClick={() =>
                          replaceQuery({
                            difficulty: toggleListValue(
                              query.difficulty,
                              diff
                            ),
                            page: 1,
                          })
                        }
                      />
                    ))}
                  </div>
                ) : null}

                {familyOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="mr-1 self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Family
                    </span>
                    {familyOptions.map((family) => (
                      <FilterChip
                        key={family}
                        label={family}
                        count={facets.family[family] ?? 0}
                        active={query.family.includes(family)}
                        onClick={() =>
                          replaceQuery({
                            family: toggleListValue(query.family, family),
                            page: 1,
                          })
                        }
                      />
                    ))}
                  </div>
                ) : null}

                {tierOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="mr-1 self-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Tier
                    </span>
                    {tierOptions.map((tier) => (
                      <FilterChip
                        key={tier}
                        label={`Tier ${tier}`}
                        count={facets.tier[tier] ?? 0}
                        active={query.tier.includes(tier)}
                        onClick={() =>
                          replaceQuery({
                            tier: toggleListValue(query.tier, tier),
                            page: 1,
                          })
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHeader
                    sortKey="control"
                    label="Control"
                    className="hidden w-[5.5rem] sm:table-cell"
                  />
                  <SortHeader
                    sortKey="title"
                    label="Finding / ticket"
                    className="min-w-0"
                  />
                  <SortHeader
                    sortKey="difficulty"
                    label="Difficulty"
                    className="hidden w-[5.5rem] lg:table-cell"
                  />
                  <SortHeader
                    sortKey="severity"
                    label="Severity"
                    className="w-[5.25rem] sm:w-[6.25rem]"
                  />
                  <SortHeader
                    sortKey="poamDue"
                    label="POA&M due"
                    className="w-[5.25rem] sm:w-[6.25rem]"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.total === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No findings match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map(({ family, tickets: familyTickets }) => (
                    <Fragment key={family ?? 'flat'}>
                      {family ? (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell
                            colSpan={5}
                            className="py-1.5 font-mono text-xs font-semibold uppercase tracking-wide whitespace-normal text-muted-foreground"
                          >
                            {family}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {familyTickets.map((ticket) => {
                        const isSelected = selected?.id === ticket.id;
                        const opensWorkbench = Boolean(ticket.workbenchHref);
                        return (
                          <TableRow
                            key={ticket.id}
                            role={opensWorkbench ? 'link' : 'button'}
                            tabIndex={0}
                            aria-label={activationLabel(ticket)}
                            aria-current={
                              !opensWorkbench && isSelected
                                ? 'true'
                                : undefined
                            }
                            data-state={isSelected ? 'selected' : undefined}
                            className={cn(
                              'cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                              isSelected &&
                                'bg-secondary/80 hover:bg-secondary/80'
                            )}
                            onClick={() => activateTicket(ticket)}
                            onKeyDown={(event) => onRowKeyDown(event, ticket)}
                          >
                            <TableCell className="hidden align-top font-mono text-xs whitespace-nowrap sm:table-cell">
                              {ticket.controlId ?? '—'}
                            </TableCell>
                            <TableCell className="max-w-0 min-w-0 align-top whitespace-normal py-2">
                              <TicketRow
                                ticket={toTicketRowData(ticket)}
                                nowMs={nowMs}
                                showPriority={false}
                                titleLineClamp={2}
                                className="pointer-events-none"
                              />
                            </TableCell>
                            <TableCell className="hidden align-top lg:table-cell">
                              <DifficultyBadge
                                difficulty={ticket.difficulty}
                              />
                            </TableCell>
                            <TableCell className="align-top whitespace-nowrap">
                              {isFindingSeverity(ticket.severity) ? (
                                <SeverityBadge severity={ticket.severity} />
                              ) : (
                                <span
                                  className="text-xs text-muted-foreground"
                                  aria-label="Unrated severity"
                                >
                                  Unrated
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="align-top font-mono text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                              {formatLedgerDate(ticket.poamDueAt)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {paged.totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
              <p className="text-xs text-muted-foreground">
                Page {paged.page} of {paged.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paged.page <= 1}
                  onClick={() => replaceQuery({ page: paged.page - 1 })}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paged.page >= paged.totalPages}
                  onClick={() => replaceQuery({ page: paged.page + 1 })}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <aside
          className="border border-border bg-card xl:sticky xl:top-4 xl:self-start"
          aria-labelledby={
            detailTicket ? 'selected-ticket-heading' : 'catalog-ref-heading'
          }
        >
          {detailTicket ? (
            <div className="space-y-3 p-4">
              <div>
                <Eyebrow>Selected finding</Eyebrow>
                <h2
                  id="selected-ticket-heading"
                  className="mt-1 text-body-lg leading-heading"
                >
                  {detailTicket.controlId ? (
                    <>
                      <span className="font-mono">{detailTicket.controlId}</span>
                      {' · '}
                    </>
                  ) : null}
                  {detailTicket.title}
                </h2>
                {detailTicket.scenarioBrief ? (
                  <ScenarioProse
                    as="p"
                    className="mt-2 text-muted-foreground"
                  >
                    {detailTicket.scenarioBrief}
                  </ScenarioProse>
                ) : detailTicket.subtitle ? (
                  <p className="mt-2 text-small text-muted-foreground">
                    {detailTicket.subtitle}
                  </p>
                ) : null}
              </div>
              <TicketStatusControl
                trackSlug={trackSlug}
                ticketId={detailTicket.id}
                status={detailTicket.status}
                onStatusChange={(next) =>
                  setTicketStatus(detailTicket.id, next)
                }
              />
              <p className="text-xs text-muted-foreground">
                {source === 'mock'
                  ? 'Mock ticket — open the workbench when live data is available.'
                  : 'No workbench link for this ticket.'}
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-border px-4 py-2">
                <h2 id="catalog-ref-heading" className="text-sm font-semibold">
                  Control catalog (quick ref)
                </h2>
                <p className="text-xs text-muted-foreground">
                  NIST SP 800-53 excerpt
                  {findings.some((t) => t.workbenchHref)
                    ? ' · select a row to open its workbench'
                    : null}
                </p>
              </div>
              <ScrollArea className="h-[28rem]">
                <ul className="divide-y divide-border">
                  {MOCK_CONTROLS.map((control) => (
                    <li key={control.id} className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold">
                        {control.id}
                      </p>
                      <p className="mt-0.5 text-sm font-medium leading-snug">
                        {control.title}
                      </p>
                      <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {control.statement}
                      </p>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
