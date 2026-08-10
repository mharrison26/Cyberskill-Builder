'use client';

import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SlaCountdown } from '@/components/tickets/SlaCountdown';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { getSlaState } from '@/lib/tickets/sla';
import type { TicketProgressStatus } from '@/types';
import { cn } from '@/lib/utils';

export type TicketRowData = {
  id: string;
  /** Primary line — subject, finding title, or scenario brief. */
  title: string;
  /** Optional secondary line (requester, control family, hostname, etc.). */
  subtitle?: string | null;
  difficulty: string;
  slaMinutes: number;
  startedAt: string | null;
  status: TicketProgressStatus;
};

type TicketRowProps = {
  ticket: TicketRowData;
  /** Shared list clock; when omitted, SlaCountdown ticks on its own. */
  nowMs?: number;
  className?: string;
  /**
   * When false, omit the difficulty/priority badge (e.g. GRC console shows
   * Difficulty in its own column, separate from finding Severity).
   */
  showPriority?: boolean;
  /** Extra trailing slot (status control, open chevron, etc.). */
  trailing?: React.ReactNode;
  onClick?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

/**
 * Atomic ticket row content — priority, title, SLA, status.
 * No table/grid/page chrome; each track console composes layout around this.
 */
export function TicketRow({
  ticket,
  nowMs,
  className,
  showPriority = true,
  trailing,
  onClick,
  onKeyDown,
}: TicketRowProps) {
  const sla = getSlaState(ticket.slaMinutes, ticket.startedAt, nowMs);
  const interactive = Boolean(onClick);

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3',
        interactive && 'cursor-pointer',
        sla.isOverdue && 'text-status-blocked-foreground',
        className
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={
        interactive
          ? `Open ticket: ${ticket.title}${sla.isOverdue ? ' (overdue)' : ''}`
          : undefined
      }
    >
      {showPriority ? (
        <PriorityBadge difficulty={ticket.difficulty} className="shrink-0" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {ticket.title}
        </p>
        {ticket.subtitle ? (
          <p className="truncate text-xs text-muted-foreground">
            {ticket.subtitle}
          </p>
        ) : null}
      </div>
      <SlaCountdown
        slaMinutes={ticket.slaMinutes}
        startedAt={ticket.startedAt}
        nowMs={nowMs}
        className="shrink-0"
      />
      <TicketStatusBadge status={ticket.status} className="shrink-0" />
      {trailing}
    </div>
  );
}
