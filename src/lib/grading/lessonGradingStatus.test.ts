import { describe, expect, it } from 'vitest';

import {
  extractMemoFromSubmission,
  resolveDisplayedGradingError,
  resolveLessonGradingPhase,
} from '@/lib/grading/lessonGradingStatus';
import { GRADING_TIMEOUT_USER_MESSAGE } from '@/lib/grading/gradingJob';

describe('resolveLessonGradingPhase', () => {
  it('returns completed when progress is reviewed', () => {
    expect(
      resolveLessonGradingPhase({
        status: 'reviewed',
        gradingError: null,
        hasFinding: false,
      })
    ).toBe('completed');
  });

  it('returns failed when submitted with a grading_error', () => {
    expect(
      resolveLessonGradingPhase({
        status: 'submitted',
        gradingError: 'Grading failed — your answer is saved. You can retry.',
        hasFinding: false,
      })
    ).toBe('failed');
  });

  it('returns failed when job status is failed', () => {
    expect(
      resolveLessonGradingPhase({
        status: 'submitted',
        gradingError: null,
        hasFinding: false,
        gradingJobStatus: 'failed',
      })
    ).toBe('failed');
  });

  it('returns pending when submitted without an error', () => {
    expect(
      resolveLessonGradingPhase({
        status: 'submitted',
        gradingError: null,
        hasFinding: false,
        gradingJobStatus: 'queued',
      })
    ).toBe('pending');
  });

  it('returns failed when a running job exceeds the timeout', () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    expect(
      resolveLessonGradingPhase({
        status: 'submitted',
        gradingError: null,
        hasFinding: false,
        gradingJobStatus: 'running',
        gradingStartedAt: '2026-08-11T11:50:00.000Z',
        now,
      })
    ).toBe('failed');
  });

  it('keeps long-queued jobs pending so workers can still claim them', () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    expect(
      resolveLessonGradingPhase({
        status: 'submitted',
        gradingError: null,
        hasFinding: false,
        gradingJobStatus: 'queued',
        now,
      })
    ).toBe('pending');
  });

  it('returns not_submitted otherwise', () => {
    expect(
      resolveLessonGradingPhase({
        status: 'in_progress',
        gradingError: null,
        hasFinding: false,
      })
    ).toBe('not_submitted');
  });
});

describe('resolveDisplayedGradingError', () => {
  it('returns timeout copy when failed without a stored error', () => {
    expect(
      resolveDisplayedGradingError({
        phase: 'failed',
        gradingError: null,
      })
    ).toBe(GRADING_TIMEOUT_USER_MESSAGE);
  });
});

describe('extractMemoFromSubmission', () => {
  it('reads conceptual memo text', () => {
    expect(
      extractMemoFromSubmission({
        type: 'conceptual',
        memo: 'Orientation memo body',
        submittedAt: '2026-08-10T00:00:00.000Z',
      })
    ).toBe('Orientation memo body');
  });

  it('returns null for non-conceptual payloads', () => {
    expect(extractMemoFromSubmission({ type: 'catalog_lab' })).toBeNull();
  });
});
