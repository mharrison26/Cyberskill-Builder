'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { TicketRow } from '@/components/tickets/TicketRow';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSharedSlaClock } from '@/hooks/useTicketSlaCountdown';
import { useTrackTickets } from '@/hooks/useTrackTickets';
import { MOCK_ISSO_SYSTEMS } from '@/lib/mock-data';
import { isOpenTicketStatus } from '@/lib/tickets/status';
import { cn } from '@/lib/utils';

/**
 * ISSO operations console — systems under stewardship, implementation /
 * evidence tasks, and POA&M work. Distinct from GRC (assessor audit log)
 * and ISSM (program oversight).
 */
export function IssoOpsConsole({
  trackSlug = 'isso',
  initialTickets,
  initialSource,
}: {
  trackSlug?: string;
  initialTickets?: import('@/types').MockTrackTicket[];
  initialSource?: 'live' | 'mock' | 'mixed';
}) {
  const { tickets, setTicketStatus } = useTrackTickets(trackSlug, {
    initialTickets,
    initialSource,
  });
  const [systemFilter, setSystemFilter] = useState<string | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    () => tickets[0]?.id ?? null
  );
  const nowMs = useSharedSlaClock(tickets.some((t) => t.startedAt));

  const filtered = useMemo(
    () =>
      systemFilter === 'all'
        ? tickets
        : tickets.filter((t) => t.systemName === systemFilter),
    [tickets, systemFilter]
  );

  const selected = tickets.find((t) => t.id === selectedId) ?? null;
  const openCount = tickets.filter((t) => isOpenTicketStatus(t.status)).length;
  const overduePoam = tickets.filter((t) => {
    if (!t.poamDueAt || !isOpenTicketStatus(t.status)) return false;
    return new Date(t.poamDueAt).getTime() < Date.now();
  }).length;

  return (
    <div className="space-y-4">
      <SimulatedDataBanner />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            ISSO · System security operations
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            My systems workbench
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Day-to-day stewardship for systems you own: evidence collection,
            POA&M closure, and ConMon metrics — not an assessor findings log.
          </p>
        </div>
        <Button render={<Link href="/dashboard" />} variant="outline" size="sm">
          Dashboard
        </Button>
      </header>

      <section
        aria-label="Workload snapshot"
        className="grid gap-3 sm:grid-cols-3"
      >
        <div className="border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Open tasks
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold">{openCount}</p>
        </div>
        <div className="border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Overdue POA&amp;M
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-status-blocked-foreground">
            {overduePoam}
          </p>
        </div>
        <div className="border border-border bg-card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Systems owned
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold">
            {MOCK_ISSO_SYSTEMS.length}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside
          aria-label="Systems under stewardship"
          className="space-y-2 border border-border bg-card p-3"
        >
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            My systems
          </p>
          <button
            type="button"
            className={cn(
              'w-full rounded-md px-3 py-2 text-left text-sm',
              systemFilter === 'all'
                ? 'bg-secondary font-medium'
                : 'hover:bg-muted/50'
            )}
            onClick={() => setSystemFilter('all')}
          >
            All systems
          </button>
          {MOCK_ISSO_SYSTEMS.map((system) => (
            <button
              key={system.id}
              type="button"
              className={cn(
                'w-full rounded-md px-3 py-2.5 text-left',
                systemFilter === system.name
                  ? 'bg-secondary'
                  : 'hover:bg-muted/50'
              )}
              onClick={() => setSystemFilter(system.name)}
            >
              <p className="font-mono text-sm font-semibold">{system.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {system.atoStatus}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="font-normal">
                  {system.openPoams} POA&amp;M
                </Badge>
                <Badge variant="outline" className="font-normal">
                  ConMon {system.conmon}
                </Badge>
              </div>
            </button>
          ))}
        </aside>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Operational task queue</h2>
          <ul className="divide-y divide-border border border-border bg-card">
            {filtered.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full px-4 py-3 text-left hover:bg-muted/40',
                    selectedId === ticket.id && 'bg-secondary/80'
                  )}
                  onClick={() => setSelectedId(ticket.id)}
                >
                  <p className="mb-1 font-mono text-xs text-muted-foreground">
                    {ticket.systemName}
                    {ticket.controlId ? ` · ${ticket.controlId}` : ''}
                    {ticket.poamDueAt ? ` · due ${ticket.poamDueAt}` : ''}
                  </p>
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
                    className="pointer-events-none"
                  />
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="space-y-3 border border-border bg-card p-4">
              <div>
                <h3 className="font-semibold">{selected.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selected.systemName} — collect evidence, update the SSP, or
                  advance the POA&amp;M milestone for this control.
                </p>
              </div>
              <TicketStatusControl
                trackSlug={trackSlug}
                ticketId={selected.id}
                status={selected.status}
                onStatusChange={(next) => setTicketStatus(selected.id, next)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
