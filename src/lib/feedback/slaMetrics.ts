import type { TrainingFeedbackSla } from '@/lib/feedback/types';
import { wasResolvedWithinSla } from '@/lib/tickets/sla';

export function buildSlaMetrics(args: {
  slaMinutes: number;
  startedAt: string | null | undefined;
  resolvedAt: string | null | undefined;
}): TrainingFeedbackSla {
  const { slaMinutes, startedAt, resolvedAt } = args;
  let minutesTaken: number | null = null;

  if (startedAt && resolvedAt) {
    const startedMs = new Date(startedAt).getTime();
    const resolvedMs = new Date(resolvedAt).getTime();
    if (!Number.isNaN(startedMs) && !Number.isNaN(resolvedMs)) {
      minutesTaken = Math.max(
        0,
        Math.round((resolvedMs - startedMs) / 60_000)
      );
    }
  }

  return {
    minutesAllowed: slaMinutes,
    minutesTaken,
    withinSla: wasResolvedWithinSla(startedAt, resolvedAt, slaMinutes),
  };
}
