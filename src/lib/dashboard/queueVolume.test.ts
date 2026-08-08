import { describe, expect, it } from 'vitest';

import { buildQueueVolumeSeries } from '@/lib/dashboard/queueVolume';

describe('buildQueueVolumeSeries', () => {
  it('fills empty days and buckets opened/resolved by UTC day', () => {
    const now = new Date('2026-08-07T15:00:00.000Z');
    const series = buildQueueVolumeSeries(
      [
        {
          started_at: '2026-08-07T10:00:00.000Z',
          resolved_at: '2026-08-07T11:00:00.000Z',
        },
        {
          started_at: '2026-08-06T22:00:00.000Z',
          resolved_at: null,
        },
        {
          started_at: '2026-07-01T00:00:00.000Z',
          resolved_at: '2026-07-01T01:00:00.000Z',
        },
      ],
      { days: 3, now }
    );

    expect(series).toHaveLength(3);
    expect(series.map((p) => p.date)).toEqual([
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ]);
    expect(series[0]).toMatchObject({ opened: 0, resolved: 0, total: 0 });
    expect(series[1]).toMatchObject({ opened: 1, resolved: 0, total: 1 });
    expect(series[2]).toMatchObject({ opened: 1, resolved: 1, total: 2 });
  });

  it('returns a zero series when there is no ticket history', () => {
    const series = buildQueueVolumeSeries([], {
      days: 7,
      now: new Date('2026-08-07T00:00:00.000Z'),
    });
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.total === 0)).toBe(true);
  });
});
