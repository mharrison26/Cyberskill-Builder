/**
 * Percentile of `score` among peer scores (inclusive rank).
 * Returns null when the cohort (peers + self) is smaller than `minCohort`.
 */
export function computeScorePercentile(
  score: number,
  peerScores: number[],
  minCohort = 3
): number | null {
  if (!Number.isFinite(score)) return null;
  const cohort = [...peerScores.filter((n) => Number.isFinite(n)), score];
  if (cohort.length < minCohort) return null;

  const belowOrEqual = cohort.filter((n) => n <= score).length;
  return Math.round((belowOrEqual / cohort.length) * 100);
}

/** Pull a 0–100 score from common structured_result shapes. */
export function extractScorePercent(
  structured: Record<string, unknown> | null | undefined
): number | null {
  if (!structured) return null;

  const training = structured.trainingFeedback;
  if (
    training &&
    typeof training === 'object' &&
    !Array.isArray(training) &&
    typeof (training as { scorePercent?: unknown }).scorePercent === 'number'
  ) {
    return (training as { scorePercent: number }).scorePercent;
  }

  for (const key of ['percentage', 'scorePercent', 'score', 'recallPercent']) {
    const value = structured[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.min(100, value));
    }
  }

  return null;
}
