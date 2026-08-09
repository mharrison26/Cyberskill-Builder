'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { SimulatedDataBanner } from '@/components/SimulatedDataBanner';
import { TicketRow } from '@/components/tickets/TicketRow';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useSharedSlaClock } from '@/hooks/useTicketSlaCountdown';
import { useTrackTickets } from '@/hooks/useTrackTickets';
import type { MockTrackTicket } from '@/types';
import { cn } from '@/lib/utils';

type QueueTab = 'my_queue' | 'unassigned' | 'escalated';

const TABS: Array<{ id: QueueTab; label: string }> = [
  { id: 'my_queue', label: 'My Queue' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'escalated', label: 'Escalated' },
];

/**
 * HelpDesk / ServiceNow-style queue: filter tabs, large ticket list,
 * detail opens in a side drawer (not a full-page navigation).
 */
export function HelpdeskConsole({
  trackSlug = 'helpdesk',
  initialTickets,
  initialSource,
}: {
  trackSlug?: string;
  initialTickets?: MockTrackTicket[];
  initialSource?: 'live' | 'mock' | 'mixed';
}) {
  const { tickets, setTicketStatus, source } = useTrackTickets(trackSlug, {
    initialTickets,
    initialSource,
  });
  const [tab, setTab] = useState<QueueTab>('my_queue');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nowMs = useSharedSlaClock(tickets.some((t) => t.startedAt));

  const filtered = useMemo(
    () => tickets.filter((t) => (t.queueBucket ?? 'my_queue') === tab),
    [tickets, tab]
  );

  const selected: MockTrackTicket | null =
    tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <SimulatedDataBanner />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            HelpDesk · Service desk
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ticket queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Triage by queue. Open a row for the detail drawer — stay in the
            queue while you work the ticket.
          </p>
        </div>
        <Button render={<Link href="/dashboard" />} variant="outline" size="sm">
          Dashboard
        </Button>
      </header>

      <div
        role="tablist"
        aria-label="Queue filters"
        className="flex flex-wrap gap-1 border-b border-border"
      >
        {TABS.map((item) => {
          const count = tickets.filter(
            (t) => (t.queueBucket ?? 'my_queue') === item.id
          ).length;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={cn(
                '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <section
        aria-label={`${tab.replace('_', ' ')} tickets`}
        className="space-y-1"
      >
        {filtered.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No tickets in this queue.
          </p>
        ) : (
          filtered.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              className="w-full rounded-md border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
              onClick={() => setSelectedId(ticket.id)}
            >
              <TicketRow
                ticket={{
                  id: ticket.id,
                  title: ticket.title,
                  subtitle: ticket.requester
                    ? `Requester · ${ticket.requester}`
                    : ticket.subtitle,
                  difficulty: ticket.difficulty,
                  slaMinutes: ticket.slaMinutes,
                  startedAt: ticket.startedAt,
                  status: ticket.status,
                }}
                nowMs={nowMs}
                className="pointer-events-none"
              />
            </button>
          ))
        )}
      </section>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 sm:max-w-lg"
          showCloseButton
        >
          {selected ? (
            <>
              <SheetHeader className="border-b border-border">
                <SheetTitle className="pr-8 text-left leading-snug">
                  {selected.title}
                </SheetTitle>
                <SheetDescription className="text-left">
                  {selected.requester
                    ? `Requester: ${selected.requester}`
                    : selected.subtitle}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                <TicketRow
                  ticket={{
                    id: selected.id,
                    title: selected.subtitle ?? selected.ticketType,
                    subtitle: null,
                    difficulty: selected.difficulty,
                    slaMinutes: selected.slaMinutes,
                    startedAt: selected.startedAt,
                    status: selected.status,
                  }}
                  nowMs={nowMs}
                />
                <TicketStatusControl
                  trackSlug={trackSlug}
                  ticketId={selected.id}
                  status={selected.status}
                  onStatusChange={(next) => setTicketStatus(selected.id, next)}
                />
                <div className="space-y-2 text-sm">
                  <h3 className="font-semibold">Description</h3>
                  <p className="leading-relaxed text-muted-foreground">
                    Simulated helpdesk scenario. Work the SLA clock, update
                    status, then resolve with the appropriate directory or KB
                    action in the full ticket workbench when connected.
                  </p>
                </div>
                {selected.workbenchHref ? (
                  <Button
                    render={<Link href={selected.workbenchHref} />}
                    variant="outline"
                    size="sm"
                    className="self-start"
                  >
                    Open full workbench
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {source === 'mock'
                      ? 'Mock ticket — workbench opens when this track has live tickets.'
                      : null}
                  </p>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
