'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ConsoleSandboxSurface } from '@/components/consoles/ConsoleSandboxSurface';
import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { TicketRow } from '@/components/tickets/TicketRow';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSharedSlaClock } from '@/hooks/useTicketSlaCountdown';
import { useTrackTickets } from '@/hooks/useTrackTickets';
import type { MockTrackTicket } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Python Engineering — GitHub Issues-adjacent list with WebContainer
 * editor/terminal as the dominant detail panel.
 */
export function PythonDevConsole({
  trackSlug = 'python',
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
  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      tickets.find((t) => t.status === 'in_progress')?.id ??
      tickets[0]?.id ??
      null
  );
  const nowMs = useSharedSlaClock(tickets.some((t) => t.startedAt));
  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <SimulatedDataBanner />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Python Engineering · Dev console
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick an issue; the editor and terminal stay the primary surface.
          </p>
        </div>
        <Button render={<Link href="/dashboard" />} variant="outline" size="sm">
          Dashboard
        </Button>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <section
          aria-label="Issue list"
          className="max-h-[70vh] space-y-0 overflow-y-auto border border-border bg-card xl:max-h-[calc(100vh-12rem)]"
        >
          {tickets.map((ticket) => {
            const active = ticket.id === selectedId;
            return (
              <button
                key={ticket.id}
                type="button"
                className={cn(
                  'w-full border-b border-border px-3 py-3 text-left last:border-b-0',
                  active ? 'bg-secondary' : 'hover:bg-muted/40'
                )}
                onClick={() => setSelectedId(ticket.id)}
              >
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
                  className="pointer-events-none flex-col items-stretch gap-2 sm:flex-row sm:items-center"
                />
                {ticket.labels && ticket.labels.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {ticket.labels.map((label) => (
                      <Badge
                        key={label}
                        variant="outline"
                        className="font-mono text-[10px] font-normal"
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </section>

        <section
          aria-labelledby="issue-detail-heading"
          className="min-w-0 space-y-3"
        >
          {selected ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2
                    id="issue-detail-heading"
                    className="text-lg font-semibold leading-snug"
                  >
                    {selected.title}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {selected.subtitle}
                  </p>
                </div>
                <TicketStatusControl
                  trackSlug={trackSlug}
                  ticketId={selected.id}
                  status={selected.status}
                  onStatusChange={(next) => setTicketStatus(selected.id, next)}
                  className="max-w-md"
                />
              </div>
              <ConsoleSandboxSurface
                ticket={selected}
                preferredLayout="editor"
                className="min-h-[min(65vh,36rem)]"
              />
              {selected.workbenchHref ? (
                <Button
                  render={<Link href={selected.workbenchHref} />}
                  variant="outline"
                  size="sm"
                >
                  Open full workbench
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select an issue.</p>
          )}
        </section>
      </div>
    </div>
  );
}
