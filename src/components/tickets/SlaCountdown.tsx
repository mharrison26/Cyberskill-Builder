'use client';

import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

import { OverdueBadge } from '@/components/tickets/OverdueBadge';
import { formatSlaCountdown, getSlaState } from '@/lib/tickets/sla';
import { cn } from '@/lib/utils';

type SlaCountdownProps = {
  slaMinutes: number;
  startedAt: string | null;
  /** Optional controlled clock (e.g. shared queue tick). */
  nowMs?: number;
  className?: string;
};

function formatSlaWindow(slaMinutes: number): string {
  return slaMinutes >= 60
    ? `${Math.round(slaMinutes / 60)}h window`
    : `${slaMinutes}m window`;
}

export function SlaCountdown({
  slaMinutes,
  startedAt,
  nowMs: controlledNowMs,
  className,
}: SlaCountdownProps) {
  const [localNowMs, setLocalNowMs] = useState(() => Date.now());
  const isControlled = controlledNowMs !== undefined;
  const nowMs = isControlled ? controlledNowMs : localNowMs;

  useEffect(() => {
    if (isControlled || !startedAt) return;
    const id = window.setInterval(() => setLocalNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isControlled, startedAt]);

  const state = getSlaState(slaMinutes, startedAt, nowMs);

  if (state.notStarted) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-sm text-muted-foreground',
          className
        )}
      >
        <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
        <span>Not started · {formatSlaWindow(slaMinutes)}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums',
        state.isOverdue ? 'text-status-blocked-foreground' : 'text-foreground',
        className
      )}
      title={
        state.deadlineAt
          ? `Deadline ${state.deadlineAt.toLocaleString()}`
          : undefined
      }
    >
      {state.isOverdue ? <OverdueBadge /> : null}
      <span className="inline-flex items-center gap-1.5">
        <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
        <span>{formatSlaCountdown(state.remainingMs)}</span>
      </span>
    </span>
  );
}
