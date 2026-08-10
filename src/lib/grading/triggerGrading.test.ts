import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/grading/gradeSubmission', () => {
  class MissingAnthropicApiKeyError extends Error {
    constructor() {
      super('ANTHROPIC_API_KEY is not configured');
      this.name = 'MissingAnthropicApiKeyError';
    }
  }

  return {
    MissingAnthropicApiKeyError,
    gradeSubmission: vi.fn(),
  };
});

import {
  gradeSubmission,
  MissingAnthropicApiKeyError,
} from '@/lib/grading/gradeSubmission';
import { triggerGrading } from '@/lib/grading/triggerGrading';

type UpdateCall = {
  values: Record<string, unknown>;
  id: string;
};

function createSupabaseMock() {
  const updates: UpdateCall[] = [];

  const supabase = {
    from(table: string) {
      if (table !== 'lesson_progress') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_column: string, id: string) {
              updates.push({ values, id });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return { supabase, updates };
}

describe('triggerGrading', () => {
  beforeEach(() => {
    vi.mocked(gradeSubmission).mockReset();
  });

  it('persists grading_error when Claude grading fails', async () => {
    vi.mocked(gradeSubmission).mockRejectedValue(new Error('model timeout'));
    const { supabase, updates } = createSupabaseMock();

    const result = await triggerGrading({
      supabase: supabase as never,
      progressId: 'progress-1',
      studentId: 'student-1',
      tenantId: 'tenant-1',
      lessonId: 'lesson-1',
      trackId: 'track-1',
      dcwfCode: null,
      submission: {
        type: 'conceptual',
        memo: 'a'.repeat(120),
        submittedAt: '2026-08-10T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('your answer is saved');
    expect(updates.some((call) => call.values.grading_error != null)).toBe(
      true
    );
  });

  it('records a clear failure when the API key is missing', async () => {
    vi.mocked(gradeSubmission).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );
    const { supabase, updates } = createSupabaseMock();

    const result = await triggerGrading({
      supabase: supabase as never,
      progressId: 'progress-1',
      studentId: 'student-1',
      tenantId: 'tenant-1',
      lessonId: 'lesson-1',
      trackId: 'track-1',
      dcwfCode: null,
      submission: {
        type: 'conceptual',
        memo: 'a'.repeat(120),
        submittedAt: '2026-08-10T00:00:00.000Z',
      },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/not configured|answer is saved/i);
    expect(
      updates.some(
        (call) =>
          typeof call.values.grading_error === 'string' &&
          call.values.grading_error.length > 0
      )
    ).toBe(true);
  });

  it('clears grading_error on success', async () => {
    vi.mocked(gradeSubmission).mockResolvedValue({
      finding: { id: 'finding-1' },
      aiFindingState: 'satisfied',
    } as never);
    const { supabase, updates } = createSupabaseMock();

    const result = await triggerGrading({
      supabase: supabase as never,
      progressId: 'progress-1',
      studentId: 'student-1',
      tenantId: 'tenant-1',
      lessonId: 'lesson-1',
      trackId: 'track-1',
      dcwfCode: null,
      submission: {
        type: 'conceptual',
        memo: 'a'.repeat(120),
        submittedAt: '2026-08-10T00:00:00.000Z',
      },
    });

    expect(result).toEqual({
      status: 'completed',
      findingId: 'finding-1',
      aiFindingState: 'satisfied',
    });
    expect(
      updates.some(
        (call) =>
          call.values.grading_error === null &&
          typeof call.values.graded_at === 'string'
      )
    ).toBe(true);
  });
});
