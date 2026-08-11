'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SlaCountdown } from '@/components/tickets/SlaCountdown';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSlaState, needsLiveSlaCountdown } from '@/lib/tickets/sla';
import { isClosedTicketStatus } from '@/lib/tickets/status';
import type { TicketProgressStatus } from '@/types';
import { cn } from '@/lib/utils';

export type TicketQueueRow = {
  id: string;
  scenarioBrief: string;
  ticketType: string;
  difficulty: string;
  slaMinutes: number;
  startedAt: string | null;
  resolvedAt?: string | null;
  slaDueAt?: string | null;
  slaMet?: boolean | null;
  status: TicketProgressStatus;
  href: string;
};

type TicketQueueTableProps = {
  rows: TicketQueueRow[];
  emptyMessage?: string;
  className?: string;
};

export function TicketQueueTable({
  rows,
  emptyMessage = 'No open tickets in your active tier.',
  className,
}: TicketQueueTableProps) {
  const router = useRouter();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const needsTick = rows.some((row) =>
    needsLiveSlaCountdown(row.startedAt, {
      resolvedAt: row.resolvedAt,
      slaMet: row.slaMet,
      closed: isClosedTicketStatus(row.status),
    })
  );

  useEffect(() => {
    if (!needsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [needsTick]);

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-border bg-surface px-6 py-10 text-center text-surface-foreground shadow-xs',
          className
        )}
      >
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-surface text-surface-foreground shadow-xs',
        className
      )}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Priority</TableHead>
            <TableHead scope="col">Ticket</TableHead>
            <TableHead scope="col">Type</TableHead>
            <TableHead scope="col">SLA</TableHead>
            <TableHead scope="col">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const closed = isClosedTicketStatus(row.status);
            const sla = getSlaState(row.slaMinutes, row.startedAt, nowMs, {
              resolvedAt: row.resolvedAt,
              slaDueAt: row.slaDueAt,
              slaMet: row.slaMet,
            });
            const showOverdue = sla.isOverdue && !sla.isFrozen && !closed;
            return (
              <TableRow
                key={row.id}
                tabIndex={0}
                role="link"
                aria-label={`Open ticket: ${row.scenarioBrief}${
                  showOverdue ? ' (overdue)' : ''
                }`}
                className={cn(
                  'cursor-pointer',
                  showOverdue &&
                    'bg-status-blocked/50 hover:bg-status-blocked/70'
                )}
                onClick={() => router.push(row.href)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(row.href);
                  }
                }}
              >
                <TableCell>
                  <PriorityBadge difficulty={row.difficulty} />
                </TableCell>
                <TableCell className="max-w-md whitespace-normal font-medium">
                  <span className="line-clamp-2">{row.scenarioBrief}</span>
                </TableCell>
                <TableCell className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {row.ticketType.replace(/_/g, ' ')}
                </TableCell>
                <TableCell>
                  <SlaCountdown
                    slaMinutes={row.slaMinutes}
                    startedAt={row.startedAt}
                    resolvedAt={row.resolvedAt}
                    slaDueAt={row.slaDueAt}
                    slaMet={row.slaMet}
                    frozen={closed}
                    nowMs={nowMs}
                  />
                </TableCell>
                <TableCell>
                  <TicketStatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
