'use client';

import Link from 'next/link';
import { useState } from 'react';
import { X } from 'lucide-react';

import { ConsoleSandboxSurface } from '@/components/consoles/ConsoleSandboxSurface';
import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { TicketRow, toTicketRowData } from '@/components/tickets/TicketRow';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSharedSlaClock } from '@/hooks/useTicketSlaCountdown';
import { useTrackTickets } from '@/hooks/useTrackTickets';
import { MOCK_NOC_SYSTEMS } from '@/lib/mock-data';
import { needsLiveSlaCountdown } from '@/lib/tickets/sla';
import { isClosedTicketStatus } from '@/lib/tickets/status';
import type { MockTrackTicket } from '@/types';
import { cn } from '@/lib/utils';

function healthTone(status: (typeof MOCK_NOC_SYSTEMS)[number]['status']) {
  switch (status) {
    case 'critical':
      return 'border-status-blocked-foreground/40 bg-status-blocked/40';
    case 'degraded':
    case 'warning':
      return 'border-status-insufficient-foreground/40 bg-status-insufficient/40';
    case 'healthy':
    default:
      return 'border-status-satisfied-foreground/30 bg-status-satisfied/30';
  }
}

/**
 * IT Admin / Sysadmin NOC wall: system-status tiles, alerts feed,
 * full-screen incident view with embedded sandbox terminal.
 */
export function SysadminNocConsole({
  trackSlug = 'sysadmin',
  initialTickets,
  initialSource,
}: {
  trackSlug?: string;
  initialTickets?: MockTrackTicket[];
  initialSource?: 'live' | 'mock' | 'mixed';
}) {
  const { tickets, setTicketStatus } = useTrackTickets(trackSlug, {
    initialTickets,
    initialSource,
  });
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const nowMs = useSharedSlaClock(
    tickets.some((t) =>
      needsLiveSlaCountdown(t.startedAt, {
        resolvedAt: t.resolvedAt,
        slaMet: t.slaMet,
        closed: isClosedTicketStatus(t.status),
      })
    )
  );
  const incident = tickets.find((t) => t.id === incidentId) ?? null;

  if (incident) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-6">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">
              INCIDENT VIEW · {incident.hostname}
            </p>
            <h1 className="truncate text-lg font-semibold">{incident.title}</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIncidentId(null)}
          >
            <X className="size-4" aria-hidden="true" />
            Back to NOC
          </Button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
          <SimulatedDataBanner />
          <TicketStatusControl
            trackSlug={trackSlug}
            ticketId={incident.id}
            status={incident.status}
            onStatusChange={(next) => setTicketStatus(incident.id, next)}
          />
          <ConsoleSandboxSurface
            ticket={incident}
            preferredLayout="terminal"
            className="min-h-[min(60vh,32rem)] flex-1"
          />
          {incident.workbenchHref ? (
            <Button
              render={<Link href={incident.workbenchHref} />}
              variant="outline"
              size="sm"
              className="self-start"
            >
              Open ticket workbench
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SimulatedDataBanner />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            IT Admin · Network operations
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">NOC wall</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            System health tiles above; alerts feed below. Open an alert for a
            full-screen incident shell.
          </p>
        </div>
        <Button render={<Link href="/dashboard" />} variant="outline" size="sm">
          Dashboard
        </Button>
      </header>

      <section
        aria-label="System status"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {MOCK_NOC_SYSTEMS.map((system) => (
          <div
            key={system.id}
            className={cn('border px-4 py-3', healthTone(system.status))}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">{system.name}</p>
              <Badge variant="outline" className="capitalize font-normal">
                {system.status}
              </Badge>
            </div>
            <p className="mt-2 font-mono text-xs text-foreground/80">
              {system.hostname}
            </p>
            <p className="mt-1 font-mono text-sm tabular-nums">
              {system.metric}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="alerts-heading" className="space-y-2">
        <h2 id="alerts-heading" className="text-sm font-semibold">
          Alerts / incident feed
        </h2>
        <ul className="divide-y divide-border border border-border bg-card">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/40"
                onClick={() => setIncidentId(ticket.id)}
              >
                <p className="font-mono text-xs text-muted-foreground">
                  {ticket.hostname}
                </p>
                <TicketRow
                  ticket={toTicketRowData(ticket)}
                  nowMs={nowMs}
                  className="pointer-events-none"
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
