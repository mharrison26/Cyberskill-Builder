import { describe, expect, it } from 'vitest';

import { getSystemsStatus } from '@/lib/dashboard/systemsStatus';

describe('getSystemsStatus', () => {
  it('is stable for the same student and UTC day', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    const a = getSystemsStatus('student-a', now);
    const b = getSystemsStatus('student-a', now);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });

  it('can differ across students or days without flickering per render', () => {
    const day = new Date('2026-08-07T08:00:00.000Z');
    const nextDay = new Date('2026-08-08T08:00:00.000Z');
    const a = getSystemsStatus('student-a', day);
    const b = getSystemsStatus('student-b', day);
    const c = getSystemsStatus('student-a', nextDay);

    expect(a.every((row) => row.health)).toBe(true);
    // Not asserting inequality (hash may collide); asserting shape + day stability.
    expect(getSystemsStatus('student-a', day)).toEqual(a);
    expect(b).toHaveLength(5);
    expect(c).toHaveLength(5);
  });
});
