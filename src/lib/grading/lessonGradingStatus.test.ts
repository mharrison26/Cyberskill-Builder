import { describe, expect, it } from 'vitest';

import {
  extractMemoFromSubmission,
  resolveLessonGradingPhase,
} from '@/lib/grading/lessonGradingStatus';

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
        gradingError: 'Grading failed, your answer is saved. You can retry.',
        hasFinding: false,
      })
    ).toBe('failed');
  });

  it('returns pending when submitted without an error', () => {
    expect(
      resolveLessonGradingPhase({
        status: 'submitted',
        gradingError: null,
        hasFinding: false,
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
