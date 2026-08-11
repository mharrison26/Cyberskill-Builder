import { describe, expect, it } from 'vitest';

import {
  isAdminRerunJobStatus,
  shouldIncludePendingSubmission,
} from './adminPendingQueue';

describe('isAdminRerunJobStatus', () => {
  it('accepts queued, running, and failed', () => {
    expect(isAdminRerunJobStatus('queued')).toBe(true);
    expect(isAdminRerunJobStatus('running')).toBe(true);
    expect(isAdminRerunJobStatus('failed')).toBe(true);
  });

  it('rejects succeeded and empty values', () => {
    expect(isAdminRerunJobStatus('succeeded')).toBe(false);
    expect(isAdminRerunJobStatus(null)).toBe(false);
    expect(isAdminRerunJobStatus(undefined)).toBe(false);
  });
});

describe('shouldIncludePendingSubmission', () => {
  const findingKeys = new Set([
    'student-a:lesson-1',
    'student-b:lesson-2',
  ]);

  it('includes stuck jobs even when an older finding exists', () => {
    expect(
      shouldIncludePendingSubmission({
        studentId: 'student-a',
        lessonId: 'lesson-1',
        gradingJobStatus: 'failed',
        findingKeys,
      })
    ).toBe(true);
    expect(
      shouldIncludePendingSubmission({
        studentId: 'student-a',
        lessonId: 'lesson-1',
        gradingJobStatus: 'queued',
        findingKeys,
      })
    ).toBe(true);
    expect(
      shouldIncludePendingSubmission({
        studentId: 'student-a',
        lessonId: 'lesson-1',
        gradingJobStatus: 'running',
        findingKeys,
      })
    ).toBe(true);
  });

  it('includes submitted rows without a finding', () => {
    expect(
      shouldIncludePendingSubmission({
        studentId: 'student-c',
        lessonId: 'lesson-3',
        gradingJobStatus: null,
        findingKeys,
      })
    ).toBe(true);
  });

  it('hides non-stuck rows that already have a finding', () => {
    expect(
      shouldIncludePendingSubmission({
        studentId: 'student-a',
        lessonId: 'lesson-1',
        gradingJobStatus: null,
        findingKeys,
      })
    ).toBe(false);
    expect(
      shouldIncludePendingSubmission({
        studentId: 'student-b',
        lessonId: 'lesson-2',
        gradingJobStatus: 'succeeded',
        findingKeys,
      })
    ).toBe(false);
  });
});
