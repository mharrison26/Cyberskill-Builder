import { buildSlaMetrics } from '@/lib/feedback/slaMetrics';
import {
  computeScorePercentile,
  extractScorePercent,
} from '@/lib/feedback/percentile';
import {
  extractTrainingFeedback,
  type TrainingFeedback,
} from '@/lib/feedback/types';

/**
 * Attach SLA + cohort percentile onto an existing trainingFeedback payload
 * and ensure it is nested under structuredResult.trainingFeedback.
 */
export function enrichTrainingFeedback(args: {
  structuredResult: Record<string, unknown>;
  trainingFeedback?: TrainingFeedback | null;
  slaMinutes: number;
  startedAt: string | null | undefined;
  resolvedAt: string | null | undefined;
  peerStructuredResults?: Array<Record<string, unknown> | null | undefined>;
}): {
  structuredResult: Record<string, unknown>;
  trainingFeedback: TrainingFeedback | null;
} {
  const base =
    args.trainingFeedback ??
    extractTrainingFeedback(args.structuredResult) ??
    null;

  if (!base) {
    return {
      structuredResult: args.structuredResult,
      trainingFeedback: null,
    };
  }

  const peerScores = (args.peerStructuredResults ?? [])
    .map((row) => extractScorePercent(row ?? undefined))
    .filter((n): n is number => n !== null);

  const enriched: TrainingFeedback = {
    ...base,
    sla: buildSlaMetrics({
      slaMinutes: args.slaMinutes,
      startedAt: args.startedAt,
      resolvedAt: args.resolvedAt,
    }),
    percentile: computeScorePercentile(base.scorePercent, peerScores),
  };

  return {
    structuredResult: {
      ...args.structuredResult,
      trainingFeedback: enriched,
    },
    trainingFeedback: enriched,
  };
}
