import { describe, expect, it } from 'vitest';

import {
  computeSlaCompliancePercent,
  formatSlaCountdown,
  getSlaState,
  needsLiveSlaCountdown,
  wasResolvedWithinSla,
} from '@/lib/tickets/sla';

describe('getSlaState', () => {
  it('treats missing started_at as not started', () => {
    const state = getSlaState(30, null, Date.now());
    expect(state.notStarted).toBe(true);
    expect(state.isOverdue).toBe(false);
    expect(state.isFrozen).toBe(false);
    expect(state.remainingMs).toBe(30 * 60_000);
  });

  it('counts down from started_at', () => {
    const started = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const now = new Date('2026-01-01T00:10:00.000Z').getTime();
    const state = getSlaState(30, started, now);
    expect(state.notStarted).toBe(false);
    expect(state.isFrozen).toBe(false);
    expect(state.remainingMs).toBe(20 * 60_000);
    expect(state.isOverdue).toBe(false);
  });

  it('marks overdue when past deadline', () => {
    const started = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const now = new Date('2026-01-01T01:00:00.000Z').getTime();
    const state = getSlaState(30, started, now);
    expect(state.isOverdue).toBe(true);
    expect(state.remainingMs).toBe(-30 * 60_000);
  });

  it('freezes remaining time at resolved_at', () => {
    const started = '2026-01-01T00:00:00.000Z';
    const resolved = '2026-01-01T00:10:00.000Z';
    const later = new Date('2026-01-01T01:00:00.000Z').getTime();
    const state = getSlaState(30, started, later, {
      resolvedAt: resolved,
      slaMet: true,
    });
    expect(state.isFrozen).toBe(true);
    expect(state.remainingMs).toBe(20 * 60_000);
    expect(state.slaMet).toBe(true);
    expect(state.isOverdue).toBe(false);
  });

  it('uses slaDueAt when provided', () => {
    const started = '2026-01-01T00:00:00.000Z';
    const due = '2026-01-01T00:45:00.000Z';
    const now = new Date('2026-01-01T00:15:00.000Z').getTime();
    const state = getSlaState(30, started, now, { slaDueAt: due });
    expect(state.remainingMs).toBe(30 * 60_000);
  });
});

describe('needsLiveSlaCountdown', () => {
  it('ticks only for started open tickets', () => {
    expect(needsLiveSlaCountdown(null)).toBe(false);
    expect(needsLiveSlaCountdown('2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('does not tick when resolved or closed', () => {
    expect(
      needsLiveSlaCountdown('2026-01-01T00:00:00.000Z', {
        resolvedAt: '2026-01-01T00:10:00.000Z',
      })
    ).toBe(false);
    expect(
      needsLiveSlaCountdown('2026-01-01T00:00:00.000Z', { slaMet: true })
    ).toBe(false);
    expect(
      needsLiveSlaCountdown('2026-01-01T00:00:00.000Z', { closed: true })
    ).toBe(false);
  });
});

describe('formatSlaCountdown', () => {
  it('formats minutes and seconds', () => {
    expect(formatSlaCountdown(125_000)).toBe('2:05');
  });

  it('prefixes overdue values with a minus', () => {
    expect(formatSlaCountdown(-65_000)).toBe('-1:05');
  });
});

describe('wasResolvedWithinSla', () => {
  it('returns null when timestamps are missing', () => {
    expect(wasResolvedWithinSla(null, '2026-01-01T00:20:00.000Z', 30)).toBe(
      null
    );
    expect(wasResolvedWithinSla('2026-01-01T00:00:00.000Z', null, 30)).toBe(
      null
    );
  });

  it('returns true when resolved inside the window', () => {
    expect(
      wasResolvedWithinSla(
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:20:00.000Z',
        30
      )
    ).toBe(true);
  });

  it('returns false when resolved after the window', () => {
    expect(
      wasResolvedWithinSla(
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:45:00.000Z',
        30
      )
    ).toBe(false);
  });
});

describe('computeSlaCompliancePercent', () => {
  it('returns null with no countable resolutions', () => {
    expect(computeSlaCompliancePercent([])).toBe(null);
    expect(
      computeSlaCompliancePercent([
        {
          startedAt: null,
          resolvedAt: '2026-01-01T00:10:00.000Z',
          slaMinutes: 30,
        },
      ])
    ).toBe(null);
  });

  it('computes rounded percentage within SLA', () => {
    const percent = computeSlaCompliancePercent([
      {
        startedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: '2026-01-01T00:10:00.000Z',
        slaMinutes: 30,
      },
      {
        startedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: '2026-01-01T01:00:00.000Z',
        slaMinutes: 30,
      },
      {
        startedAt: '2026-01-01T00:00:00.000Z',
        resolvedAt: '2026-01-01T00:15:00.000Z',
        slaMinutes: 30,
      },
    ]);
    expect(percent).toBe(67);
  });
});
