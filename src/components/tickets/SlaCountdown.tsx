'use client';

import { useEffect, useRef, useState } from 'react';

import { OverdueBadge } from '@/components/tickets/OverdueBadge';
import { StatusDot } from '@/components/ui/status-dot';
import { formatSlaCountdown, getSlaState } from '@/lib/tickets/sla';
import { cn } from '@/lib/utils';

type SlaCountdownProps = {
  slaMinutes: number;
  startedAt: string | null;
  /** When set, freeze the clock at resolve time. */
  resolvedAt?: string | null;
  slaDueAt?: string | null;
  slaMet?: boolean | null;
  /**
   * Force a frozen display (e.g. resolved/reviewed status) even when
   * resolvedAt has not been hydrated yet.
   */
  frozen?: boolean;
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
  resolvedAt = null,
  slaDueAt = null,
  slaMet = null,
  frozen = false,
  nowMs: controlledNowMs,
  className,
}: SlaCountdownProps) {
  const [localNowMs, setLocalNowMs] = useState(() => Date.now());
  const isControlled = controlledNowMs !== undefined;
  const nowMs = isControlled ? controlledNowMs : localNowMs;
  const shouldFreeze =
    frozen || Boolean(resolvedAt) || typeof slaMet === 'boolean';
  const fallbackResolvedAtRef = useRef<string | null>(null);

  if (shouldFreeze) {
    if (!resolvedAt && !fallbackResolvedAtRef.current) {
      fallbackResolvedAtRef.current = new Date(nowMs).toISOString();
    }
  } else {
    fallbackResolvedAtRef.current = null;
  }

  const effectiveResolvedAt = resolvedAt ?? fallbackResolvedAtRef.current;

  useEffect(() => {
    if (isControlled || !startedAt || shouldFreeze) return;
    const id = window.setInterval(() => setLocalNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isControlled, startedAt, shouldFreeze]);

  const state = getSlaState(slaMinutes, startedAt, nowMs, {
    resolvedAt: effectiveResolvedAt,
    slaDueAt,
    slaMet,
  });

  if (state.notStarted) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground',
          className
        )}
      >
        <StatusDot className="bg-muted-foreground/45" />
        <span>Not started · {formatSlaWindow(slaMinutes)}</span>
      </span>
    );
  }

  if (state.isFrozen) {
    const met =
      typeof state.slaMet === 'boolean' ? state.slaMet : !state.isOverdue;
    return (
      <span
        className={cn(
          'inline-flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums',
          met
            ? 'text-[color:var(--status-satisfied-foreground)]'
            : 'text-status-blocked-foreground',
          className
        )}
        title={
          state.deadlineAt
            ? `Deadline ${state.deadlineAt.toLocaleString()}`
            : undefined
        }
      >
        <StatusDot
          className={met ? 'bg-status-satisfied-foreground' : 'bg-status-blocked-foreground'}
        />
        <span>
          {met ? 'SLA met' : 'SLA breached'} ·{' '}
          {formatSlaCountdown(state.remainingMs)}
          {state.remainingMs >= 0 ? ' remaining' : ' over'} at close
        </span>
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
        <StatusDot
          className={
            state.isOverdue ? 'bg-status-blocked-foreground' : 'bg-status-satisfied-foreground'
          }
          pulse={!state.isOverdue}
        />
        <span>{formatSlaCountdown(state.remainingMs)}</span>
      </span>
    </span>
  );
}
