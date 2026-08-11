import { describe, expect, it } from 'vitest';

import {
  GRADING_MAX_ATTEMPTS,
  gradingRetryDelaySeconds,
  isGradingJobTimedOut,
  nextRetryAtIso,
  resolveFailureTransition,
} from '@/lib/grading/gradingJob';

describe('gradingRetryDelaySeconds', () => {
  it('returns increasing backoff within the table', () => {
    expect(gradingRetryDelaySeconds(1)).toBe(30);
    expect(gradingRetryDelaySeconds(2)).toBe(120);
    expect(gradingRetryDelaySeconds(3)).toBe(300);
    expect(gradingRetryDelaySeconds(10)).toBe(300);
  });
});

describe('isGradingJobTimedOut', () => {
  const now = new Date('2026-08-11T12:00:00.000Z');

  it('is false when not running', () => {
    expect(
      isGradingJobTimedOut({
        jobStatus: 'queued',
        gradingStartedAt: '2026-08-11T11:00:00.000Z',
        now,
      })
    ).toBe(false);
  });

  it('is false when running under the timeout', () => {
    expect(
      isGradingJobTimedOut({
        jobStatus: 'running',
        gradingStartedAt: '2026-08-11T11:58:00.000Z',
        now,
        timeoutMs: 5 * 60 * 1000,
      })
    ).toBe(false);
  });

  it('is true when running past the timeout', () => {
    expect(
      isGradingJobTimedOut({
        jobStatus: 'running',
        gradingStartedAt: '2026-08-11T11:54:00.000Z',
        now,
        timeoutMs: 5 * 60 * 1000,
      })
    ).toBe(true);
  });
});

describe('resolveFailureTransition', () => {
  const now = new Date('2026-08-11T12:00:00.000Z');

  it('schedules a retry before max attempts', () => {
    const transition = resolveFailureTransition({
      attemptCount: 1,
      message: 'model timeout',
      now,
    });
    expect(transition.terminal).toBe(false);
    expect(transition.retryAt).toBe(nextRetryAtIso(1, now));
    expect(transition.message).toContain('model timeout');
  });

  it('marks terminal failure at max attempts', () => {
    const transition = resolveFailureTransition({
      attemptCount: GRADING_MAX_ATTEMPTS,
      message: 'still failing',
      now,
    });
    expect(transition.terminal).toBe(true);
    expect(transition.retryAt).toBeNull();
  });
});
