export type QueueVolumeEvent = {
  started_at: string | null | undefined;
  resolved_at: string | null | undefined;
};

export type QueueVolumePoint = {
  /** UTC calendar day `YYYY-MM-DD`. */
  date: string;
  opened: number;
  resolved: number;
  /** opened + resolved for that day (sparkline series). */
  total: number;
};

function toUtcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Build a daily opened/resolved series from the student's ticket_progress rows.
 * Counts `started_at` as opened and `resolved_at` as resolved for each UTC day.
 */
export function buildQueueVolumeSeries(
  events: QueueVolumeEvent[],
  options: { days?: number; now?: Date } = {}
): QueueVolumePoint[] {
  const days = Math.max(1, options.days ?? 14);
  const now = options.now ?? new Date();
  const endDay = startOfUtcDay(now.getTime());
  const startDay = endDay - (days - 1) * 86_400_000;

  const byDay = new Map<string, { opened: number; resolved: number }>();
  for (let i = 0; i < days; i += 1) {
    const key = toUtcDayKey(startDay + i * 86_400_000);
    byDay.set(key, { opened: 0, resolved: 0 });
  }

  for (const event of events) {
    if (event.started_at) {
      const ms = new Date(event.started_at).getTime();
      if (!Number.isNaN(ms) && ms >= startDay && ms < endDay + 86_400_000) {
        const bucket = byDay.get(toUtcDayKey(ms));
        if (bucket) bucket.opened += 1;
      }
    }
    if (event.resolved_at) {
      const ms = new Date(event.resolved_at).getTime();
      if (!Number.isNaN(ms) && ms >= startDay && ms < endDay + 86_400_000) {
        const bucket = byDay.get(toUtcDayKey(ms));
        if (bucket) bucket.resolved += 1;
      }
    }
  }

  return Array.from(byDay.entries()).map(([date, counts]) => ({
    date,
    opened: counts.opened,
    resolved: counts.resolved,
    total: counts.opened + counts.resolved,
  }));
}
