'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckSquare, Folder, Square } from 'lucide-react';

import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { TicketRow } from '@/components/tickets/TicketRow';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { Button } from '@/components/ui/button';
import { useSharedSlaClock } from '@/hooks/useTicketSlaCountdown';
import { useTrackTickets } from '@/hooks/useTrackTickets';
import type { MockTrackTicket } from '@/types';
import { cn } from '@/lib/utils';

function groupByEngagement(tickets: MockTrackTicket[]) {
  const map = new Map<string, MockTrackTicket[]>();
  for (const ticket of tickets) {
    const key = ticket.engagementTitle ?? 'Unassigned engagement';
    const list = map.get(key) ?? [];
    list.push(ticket);
    map.set(key, list);
  }
  return Array.from(map.entries()).map(([title, rows]) => ({
    title,
    tickets: rows,
  }));
}

/**
 * IT Auditor workpaper / engagement view — folder accordion, checklist
 * progress, document-review whitespace (not a flat queue).
 */
export function AuditorConsole({
  trackSlug = 'auditor',
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
  const [activeId, setActiveId] = useState<string | null>(
    () => tickets[0]?.id ?? null
  );
  const nowMs = useSharedSlaClock(tickets.some((t) => t.startedAt));
  const engagements = useMemo(() => groupByEngagement(tickets), [tickets]);
  const active = tickets.find((t) => t.id === activeId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <SimulatedDataBanner />

      <header className="space-y-2 border-b border-border pb-8">
        <p className="text-sm font-medium text-muted-foreground">
          IT Auditor · Engagement workpapers
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Workpaper browser
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Engagements open as folders. Expand a binder, then work each
              procedure as a checklist — closer to a file browser than a ticket
              queue.
            </p>
          </div>
          <Button
            render={<Link href="/dashboard" />}
            variant="outline"
            size="sm"
          >
            Dashboard
          </Button>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section aria-label="Engagements" className="space-y-4">
          {engagements.map((engagement) => {
            const done = engagement.tickets.filter(
              (t) => t.status === 'resolved' || t.status === 'reviewed'
            ).length;
            return (
              <details
                key={engagement.title}
                className="group border-b border-border pb-4 open:pb-4"
                open
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                  <Folder
                    className="size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-base font-semibold">
                    {engagement.title}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {done}/{engagement.tickets.length} closed
                  </span>
                </summary>
                <ul className="mt-3 space-y-2 pl-8">
                  {engagement.tickets.map((ticket) => {
                    const items = ticket.workpaperItems ?? [];
                    const progress =
                      items.length === 0
                        ? 0
                        : Math.round(
                            (items.filter((i) => i.done).length /
                              items.length) *
                              100
                          );
                    const selected = activeId === ticket.id;
                    return (
                      <li key={ticket.id}>
                        <button
                          type="button"
                          className={cn(
                            'w-full rounded-md px-3 py-3 text-left transition-colors',
                            selected ? 'bg-secondary' : 'hover:bg-muted/50'
                          )}
                          onClick={() => setActiveId(ticket.id)}
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
                            className="pointer-events-none"
                          />
                          {items.length > 0 ? (
                            <p className="mt-2 font-mono text-xs text-muted-foreground">
                              Checklist {progress}%
                            </p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>

        <section
          aria-labelledby="workpaper-heading"
          className="min-h-[24rem] space-y-6 border border-border bg-card p-6 lg:sticky lg:top-4 lg:self-start"
        >
          {active ? (
            <>
              <div className="space-y-2">
                <p className="font-mono text-xs text-muted-foreground">
                  {active.controlId ?? 'WP'} · {active.engagementTitle}
                </p>
                <h2 id="workpaper-heading" className="text-xl font-semibold">
                  {active.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {active.subtitle}
                </p>
              </div>

              <TicketStatusControl
                trackSlug={trackSlug}
                ticketId={active.id}
                status={active.status}
                onStatusChange={(next) => setTicketStatus(active.id, next)}
              />

              <div>
                <h3 className="text-sm font-semibold">Workpaper procedures</h3>
                <ul className="mt-3 space-y-3">
                  {(active.workpaperItems ?? []).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 text-sm leading-relaxed"
                    >
                      {item.done ? (
                        <CheckSquare
                          className="mt-0.5 size-4 shrink-0 text-status-satisfied-foreground"
                          aria-hidden="true"
                        />
                      ) : (
                        <Square
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={cn(
                          item.done && 'text-muted-foreground line-through'
                        )}
                      >
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select a workpaper from an engagement folder.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
