'use client';

import { useEffect, useState } from 'react';

import {
  formatSlaCountdown,
  getSlaState,
  needsLiveSlaCountdown,
  type GetSlaStateOptions,
  type SlaState,
} from '@/lib/tickets/sla';

export type TicketSlaCountdown = SlaState & {
  /** Shared clock tick for list rendering; pass into SlaCountdown as nowMs. */
  nowMs: number;
  /** Human-readable remaining (or overdue) countdown. */
  label: string;
};

/**
 * Live SLA countdown from sla_minutes + started_at.
 * Layout-agnostic — every track console can reuse this clock.
 * Pass resolvedAt / slaMet to freeze after resolve (workbench parity).
 */
export function useTicketSlaCountdown(
  slaMinutes: number,
  startedAt: string | null | undefined,
  options: GetSlaStateOptions = {}
): TicketSlaCountdown {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const live = needsLiveSlaCountdown(startedAt, {
    resolvedAt: options.resolvedAt,
    slaMet: options.slaMet,
  });

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const state = getSlaState(slaMinutes, startedAt, nowMs, options);

  return {
    ...state,
    nowMs,
    label: state.notStarted
      ? slaMinutes >= 60
        ? `${Math.round(slaMinutes / 60)}h window`
        : `${slaMinutes}m window`
      : formatSlaCountdown(state.remainingMs),
  };
}

/**
 * Single shared clock for a ticket list (avoids N intervals).
 * Returns nowMs; pair with getSlaState / SlaCountdown per row.
 */
export function useSharedSlaClock(enabled: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  return nowMs;
}
