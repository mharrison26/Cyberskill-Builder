import { describe, expect, it } from 'vitest';

import {
  computeScorePercentile,
  extractScorePercent,
} from '@/lib/feedback/percentile';

describe('computeScorePercentile', () => {
  it('returns null for tiny cohorts', () => {
    expect(computeScorePercentile(80, [70])).toBeNull();
  });

  it('ranks inclusive percentile', () => {
    expect(computeScorePercentile(80, [60, 70, 90])).toBe(75);
  });
});

describe('extractScorePercent', () => {
  it('reads nested trainingFeedback first', () => {
    expect(
      extractScorePercent({
        percentage: 10,
        trainingFeedback: { scorePercent: 88 },
      })
    ).toBe(88);
  });
});
