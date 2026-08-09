'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import { BookOpen, Radio } from 'lucide-react';

import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { TicketRow } from '@/components/tickets/TicketRow';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { MOCK_CONTROLS } from '@/lib/mock-data';
import { isOpenTicketStatus } from '@/lib/tickets/status';
import type { MockTrackTicket } from '@/types';
import { cn } from '@/lib/utils';

type GrcComplianceConsoleProps = {
  trackSlug?: string;
  trackName?: string;
  initialTickets?: import('@/types').MockTrackTicket[];
  initialSource?: 'live' | 'mock' | 'mixed';
};

type Severity = 'critical' | 'high' | 'medium' | 'low';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

function severityTone(severity: Severity): string {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'bg-status-blocked text-status-blocked-foreground border-status-blocked-foreground/20';
    case 'medium':
      return 'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20';
    case 'low':
    default:
      return 'bg-status-not-started text-status-not-started-foreground border-status-not-started-foreground/20';
  }
}

function groupByControlFamily(
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
  const { tickets, setTicketStatus, source } = useTrackTickets(trackSlug, {
    initialTickets,
    initialSource,
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    () => tickets[0]?.id ?? null
  );
  const needsTick = tickets.some((t) => t.startedAt);
  const nowMs = useSharedSlaClock(needsTick);

  const selected =
    tickets.find((t) => t.id === selectedId) ?? tickets[0] ?? null;

  const openBySeverity = useMemo(() => {
    const counts: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const ticket of tickets) {
      if (!isOpenTicketStatus(ticket.status)) continue;
      const sev = ticket.severity ?? 'medium';
      counts[sev] += 1;
    }
    return counts;
  }, [tickets]);

  const poamDueCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tickets.filter((t) => {
      if (!t.poamDueAt || !isOpenTicketStatus(t.status)) return false;
      const due = new Date(t.poamDueAt);
      return (
        !Number.isNaN(due.getTime()) &&
        due.getTime() <= today.getTime() + 14 * 86_400_000
      );
    }).length;
  }, [tickets]);

  const conmonStatus = useMemo(() => {
    const open = tickets.filter((t) => isOpenTicketStatus(t.status)).length;
    const overduePoam = tickets.filter((t) => {
      if (!t.poamDueAt || !isOpenTicketStatus(t.status)) return false;
      return new Date(t.poamDueAt).getTime() < Date.now();
    }).length;
    if (overduePoam > 0) return { label: 'At risk', tone: 'blocked' as const };
    if (open > 3) return { label: 'Monitoring', tone: 'insufficient' as const };
    return { label: 'Green', tone: 'satisfied' as const };
  }, [tickets]);

  const groups = useMemo(() => groupByControlFamily(tickets), [tickets]);

  return (
    <div className="space-y-4">
      <SimulatedDataBanner />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {trackName} · Compliance operations
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Control assessment console
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Assessor findings and POA&amp;M items grouped by control family —
            audit-log density, not ISSO day-to-day ops or ISSM portfolio
            oversight.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            render={<Link href={`/tracks/${trackSlug}/catalog`} />}
            variant="outline"
            size="sm"
          >
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

      {/* Stat strip */}
      <section
        aria-label="Compliance summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} className="border border-border bg-card px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Open · {sev}
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {openBySeverity[sev]}
            </p>
          </div>
        ))}
        <div className="border border-border bg-card px-4 py-3 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            POA&M due ≤ 14d
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
            {poamDueCount}
          </p>
        </div>
        <div className="border border-border bg-card px-4 py-3 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            ConMon status
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {/* Dense audit-log table */}
          <section
            aria-labelledby="findings-log-heading"
            className="border border-border bg-card"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h2 id="findings-log-heading" className="text-sm font-semibold">
                Findings / tickets by control family
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                {tickets.length} records
              </span>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col" className="w-[7rem]">
                      Control
                    </TableHead>
                    <TableHead scope="col">Finding / ticket</TableHead>
                    <TableHead scope="col" className="w-[6rem]">
                      Severity
                    </TableHead>
                    <TableHead scope="col" className="w-[7rem]">
                      POA&M due
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map(({ family, tickets: familyTickets }) => (
                    <Fragment key={family}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={4}
                          className="py-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {family}
                        </TableCell>
                      </TableRow>
                      {familyTickets.map((ticket) => (
                        <TableRow
                          key={ticket.id}
                          data-state={
                            selected?.id === ticket.id ? 'selected' : undefined
                          }
                          className={cn(
                            'cursor-pointer',
                            selected?.id === ticket.id && 'bg-secondary/80'
                          )}
                          onClick={() => setSelectedId(ticket.id)}
                        >
                          <TableCell className="align-top font-mono text-xs">
                            {ticket.controlId ?? '—'}
                          </TableCell>
                          <TableCell className="align-top py-2">
                            <TicketRow
                              ticket={{
                                id: ticket.id,
                                title: ticket.title,
                                subtitle: ticket.subtitle,
                                difficulty: ticket.difficulty,
                                slaMinutes: ticket.slaMinutes,
                                startedAt: ticket.startedAt,
                                status: ticket.status,
                              }}
                              nowMs={nowMs}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            {ticket.severity ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'capitalize font-normal',
                                  severityTone(ticket.severity)
                                )}
                              >
                                {ticket.severity}
                              </Badge>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="align-top font-mono text-xs tabular-nums text-muted-foreground">
                            {formatLedgerDate(ticket.poamDueAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {selected ? (
            <section
              aria-labelledby="selected-ticket-heading"
              className="space-y-3 border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="selected-ticket-heading"
                    className="text-base font-semibold"
                  >
                    {selected.controlId ? `${selected.controlId} · ` : ''}
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selected.subtitle}
                  </p>
                </div>
                {selected.workbenchHref ? (
                  <Button
                    render={<Link href={selected.workbenchHref} />}
                    size="sm"
                  >
                    Open workbench
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {source === 'mock'
                      ? 'Mock ticket — workbench links when live data is available.'
                      : null}
                  </p>
                )}
              </div>
              <TicketStatusControl
                trackSlug={trackSlug}
                ticketId={selected.id}
                status={selected.status}
                onStatusChange={(next) => setTicketStatus(selected.id, next)}
              />
            </section>
          ) : null}
        </div>

        {/* Control catalog quick-reference */}
        <aside
          aria-labelledby="catalog-ref-heading"
          className="border border-border bg-card xl:sticky xl:top-4 xl:self-start"
        >
          <div className="border-b border-border px-4 py-2">
            <h2 id="catalog-ref-heading" className="text-sm font-semibold">
              Control catalog (quick ref)
            </h2>
            <p className="text-xs text-muted-foreground">
              NIST SP 800-53 excerpt
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
        </aside>
      </div>
    </div>
  );
}
