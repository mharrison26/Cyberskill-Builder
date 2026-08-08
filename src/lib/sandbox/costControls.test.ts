import { describe, expect, it } from 'vitest';

import {
  priorUtcDateString,
  projectMonthlySpend,
  utcDateString,
} from '@/lib/sandbox/costControls';
import { sessionHoursOnUtcDate } from '@/lib/sandbox/costControlsJob';

describe('sandbox cost controls helpers', () => {
  it('utcDateString / priorUtcDateString use UTC calendar days', () => {
    const noon = new Date('2026-08-07T12:00:00.000Z');
    expect(utcDateString(noon)).toBe('2026-08-07');
    expect(priorUtcDateString(noon)).toBe('2026-08-06');
  });

  it('sessionHoursOnUtcDate attributes overlap only', () => {
    // 2h session entirely on 2026-08-06
    expect(
      sessionHoursOnUtcDate(
        '2026-08-06T10:00:00.000Z',
        '2026-08-06T12:00:00.000Z',
        '2026-08-06'
      )
    ).toBe(2);

    // Spans midnight: 1h on 6th, 1h on 7th
    expect(
      sessionHoursOnUtcDate(
        '2026-08-06T23:00:00.000Z',
        '2026-08-07T01:00:00.000Z',
        '2026-08-06'
      )
    ).toBe(1);
    expect(
      sessionHoursOnUtcDate(
        '2026-08-06T23:00:00.000Z',
        '2026-08-07T01:00:00.000Z',
        '2026-08-07'
      )
    ).toBe(1);

    // No overlap
    expect(
      sessionHoursOnUtcDate(
        '2026-08-05T10:00:00.000Z',
        '2026-08-05T11:00:00.000Z',
        '2026-08-06'
      )
    ).toBe(0);
  });

  it('projectMonthlySpend extrapolates MTD hours to month end', () => {
    // Aug has 31 days; on day 10 with 10 hours @ $0.02 → MTD $0.20, projected $0.62
    const now = new Date('2026-08-10T15:00:00.000Z');
    const projection = projectMonthlySpend(10, now, 0.02, 0.5);
    expect(projection.mtdSpendUsd).toBeCloseTo(0.2, 5);
    expect(projection.projectedMonthlySpendUsd).toBeCloseTo(0.62, 5);
    expect(projection.overThreshold).toBe(true);
    expect(projection.monthKey).toBe('2026-08');
  });
});
