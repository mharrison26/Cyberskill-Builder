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
import { MOCK_ISSM_PORTFOLIO } from '@/lib/mock-data';
import { cn } from '@/lib/utils';

function riskTone(risk: string) {
  const key = risk.toLowerCase();
  if (key === 'high' || key === 'critical') {
    return 'bg-status-blocked text-status-blocked-foreground border-status-blocked-foreground/20';
  }
  if (key === 'moderate' || key === 'medium') {
    return 'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20';
  }
  return 'bg-status-satisfied text-status-satisfied-foreground border-status-satisfied-foreground/20';
}

/**
 * ISSM program console — portfolio authorization board, escalations from
 * ISSOs, package pipeline. Oversight tone; not ISSO day-to-day ops or GRC
 * assessor findings.
 */
export function IssmProgramConsole({
  trackSlug = 'issm',
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
  const [selectedId, setSelectedId] = useState<string | null>(
    () => tickets[0]?.id ?? null
  );
  const nowMs = useSharedSlaClock(tickets.some((t) => t.startedAt));
  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const escalations = useMemo(
    () =>
      tickets.filter(
        (t) =>
          t.ticketType === 'issm_escalation' ||
          t.difficulty === 'critical' ||
          t.severity === 'critical'
      ),
    [tickets]
  );

  return (
    <div className="space-y-6">
      <SimulatedDataBanner />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            ISSM · Security program oversight
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Authorization portfolio
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Cross-system risk posture, ISSO escalations, and authorization
            package gates — management view, not system-level task execution.
          </p>
        </div>
        <Button render={<Link href="/dashboard" />} variant="outline" size="sm">
          Dashboard
        </Button>
      </header>

      <section aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading" className="text-sm font-semibold">
          System authorization board
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK_ISSM_PORTFOLIO.map((system) => (
            <div
              key={system.id}
              className="border border-border bg-card px-4 py-4"
            >
              <p className="font-mono text-sm font-semibold">{system.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {system.stage}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn('font-normal', riskTone(system.risk))}
                >
                  Risk {system.risk}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  ISSO {system.isso}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section aria-labelledby="escalations-heading" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="escalations-heading" className="text-sm font-semibold">
              Escalations &amp; decisions
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              {escalations.length} flagged
            </span>
          </div>
          <ul className="divide-y divide-border border border-border bg-card">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full px-4 py-3 text-left hover:bg-muted/40',
                    selectedId === ticket.id && 'bg-secondary/80'
                  )}
                  onClick={() => setSelectedId(ticket.id)}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {ticket.systemName}
                    </span>
                    {ticket.packageStage ? (
                      <Badge variant="outline" className="font-normal">
                        {ticket.packageStage}
                      </Badge>
                    ) : null}
                  </div>
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
        </section>

        <section
          aria-labelledby="decision-heading"
          className="space-y-4 border border-border bg-card p-4 xl:sticky xl:top-4 xl:self-start"
        >
          {selected ? (
            <>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Decision queue
                </p>
                <h2
                  id="decision-heading"
                  className="mt-1 text-lg font-semibold"
                >
                  {selected.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Program-level action: accept risk, return to ISSO, advance the
                  authorization package, or allocate assessor resources.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">System</dt>
                  <dd className="font-mono font-medium">
                    {selected.systemName ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Package stage</dt>
                  <dd className="font-medium">
                    {selected.packageStage ?? '—'}
                  </dd>
                </div>
              </dl>
              <TicketStatusControl
                trackSlug={trackSlug}
                ticketId={selected.id}
                status={selected.status}
                onStatusChange={(next) => setTicketStatus(selected.id, next)}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select an escalation or package gate.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
