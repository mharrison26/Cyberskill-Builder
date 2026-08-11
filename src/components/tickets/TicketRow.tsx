'use client';

import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SlaCountdown } from '@/components/tickets/SlaCountdown';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { getSlaState } from '@/lib/tickets/sla';
import { isClosedTicketStatus } from '@/lib/tickets/status';
import type { TicketProgressStatus } from '@/types';
import { cn } from '@/lib/utils';

export type TicketRowData = {
  id: string;
  /** Primary line — short display title (not the full scenario brief). */
  title: string;
  /** Optional secondary line (requester, control family, hostname, etc.). */
  subtitle?: string | null;
  /**
   * Native tooltip / title attribute. Prefer the full scenario brief when the
   * visible title is clamped.
   */
  titleTooltip?: string | null;
  difficulty: string;
  slaMinutes: number;
  startedAt: string | null;
  /** Freeze SLA at resolve time when present. */
  resolvedAt?: string | null;
  slaDueAt?: string | null;
  slaMet?: boolean | null;
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
  /**
   * Title line clamp. Use 2 in dense tables so long labels ellipsize cleanly
   * instead of expanding the cell.
   */
  titleLineClamp?: 1 | 2;
  /** Extra trailing slot (status control, open chevron, etc.). */
  trailing?: React.ReactNode;
  onClick?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

/** Map console / queue ticket fields into TicketRowData (includes SLA freeze). */
export function toTicketRowData(
  ticket: {
    id: string;
    title: string;
    subtitle?: string | null;
    scenarioBrief?: string | null;
    titleTooltip?: string | null;
    difficulty: string;
    slaMinutes: number;
    startedAt: string | null;
    resolvedAt?: string | null;
    slaDueAt?: string | null;
    slaMet?: boolean | null;
    status: TicketProgressStatus;
  },
  overrides?: Partial<TicketRowData>
): TicketRowData {
  return {
    id: ticket.id,
    title: ticket.title,
    subtitle: ticket.subtitle ?? null,
    titleTooltip:
      ticket.titleTooltip ?? ticket.scenarioBrief ?? ticket.title ?? null,
    difficulty: ticket.difficulty,
    slaMinutes: ticket.slaMinutes,
    startedAt: ticket.startedAt,
    resolvedAt: ticket.resolvedAt ?? null,
    slaDueAt: ticket.slaDueAt ?? null,
    slaMet: ticket.slaMet ?? null,
    status: ticket.status,
    ...overrides,
  };
}

/**
 * Atomic ticket row content — priority, title, SLA, status.
 * No table/grid/page chrome; each track console composes layout around this.
 */
export function TicketRow({
  ticket,
  nowMs,
  className,
  showPriority = true,
  titleLineClamp = 1,
  trailing,
  onClick,
  onKeyDown,
}: TicketRowProps) {
  const closed = isClosedTicketStatus(ticket.status);
  const sla = getSlaState(ticket.slaMinutes, ticket.startedAt, nowMs, {
    resolvedAt: ticket.resolvedAt,
    slaDueAt: ticket.slaDueAt,
    slaMet: ticket.slaMet,
  });
  const interactive = Boolean(onClick);
  const showOverdue = sla.isOverdue && !sla.isFrozen && !closed;
  const tooltip = ticket.titleTooltip?.trim() || ticket.title;

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 transition-hover',
        interactive && 'cursor-pointer',
        showOverdue && 'text-status-blocked-foreground',
        className
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={
        interactive
          ? `Open ticket: ${ticket.title}${showOverdue ? ' (overdue)' : ''}`
          : undefined
      }
    >
      {showPriority ? (
        <PriorityBadge difficulty={ticket.difficulty} className="shrink-0" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-body font-emphasis break-words text-foreground',
            titleLineClamp === 2 ? 'line-clamp-2' : 'truncate'
          )}
          title={tooltip}
        >
          {ticket.title}
        </p>
        {ticket.subtitle ? (
          <p
            className="truncate text-small text-muted-foreground"
            title={ticket.subtitle}
          >
            {ticket.subtitle}
          </p>
        ) : null}
      </div>
      <SlaCountdown
        slaMinutes={ticket.slaMinutes}
        startedAt={ticket.startedAt}
        resolvedAt={ticket.resolvedAt}
        slaDueAt={ticket.slaDueAt}
        slaMet={ticket.slaMet}
        frozen={closed}
        nowMs={nowMs}
        className="shrink-0"
      />
      <TicketStatusBadge status={ticket.status} className="shrink-0" />
      {trailing}
    </div>
  );
}
