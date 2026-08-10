import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/grading/callClaudeGrading', () => {
  class MissingAnthropicApiKeyError extends Error {
    constructor() {
      super('ANTHROPIC_API_KEY is not configured');
      this.name = 'MissingAnthropicApiKeyError';
    }
  }

  return {
    MissingAnthropicApiKeyError,
    callClaudeGrading: vi.fn(),
  };
});

vi.mock('@/lib/grading/catalogSource', () => ({
  getCatalogSourceMetadata: () => ({
    catalog: 'NIST_SP-800-53_rev5',
    path: 'data/oscal/NIST_SP-800-53_rev5_catalog.json',
  }),
}));

import { callClaudeGrading } from '@/lib/grading/callClaudeGrading';
import { gradeToolWalkthroughLesson } from '@/lib/grading/gradeToolWalkthroughLesson';

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function createSupabaseMock(handlers: {
  lesson: QueryResult;
  progress: QueryResult;
  priorFinding: QueryResult;
  insertFinding: QueryResult;
  updateProgress?: QueryResult;
}) {
  const from = vi.fn((table: string) => {
    if (table === 'lessons') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => handlers.lesson,
          }),
        }),
      };
    }

    if (table === 'lesson_progress') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => handlers.progress,
              }),
            }),
          }),
        }),
        update: () => ({
          eq: async () =>
            handlers.updateProgress ?? { data: null, error: null },
        }),
      };
    }

    if (table === 'oscal_findings') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => handlers.priorFinding,
                }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => handlers.insertFinding,
          }),
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return { from };
}

describe('gradeToolWalkthroughLesson', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  it('RAG-grades reflection against the student prior finding after screenshot gate', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Field mapping clearly traces CCCER elements into tracker fields.',
      strengths: ['Named concrete tool fields'],
      gaps: [],
    });

    const supabase = createSupabaseMock({
      lesson: {
        data: {
          id: 'lesson-walk',
          track_id: 'track-grc',
          dcwf_code: '722',
          title: 'Open-Source Tracking Workflows',
          lesson_type: 'tool_walkthrough',
          depends_on_lesson_id: 'lesson-iam',
          control_id: null,
        },
        error: null,
      },
      progress: {
        data: {
          id: 'progress-1',
          status: 'submitted',
          submission: {
            type: 'tool_walkthrough',
            storagePath: 'ten/stu/lesson/shot.png',
            externalReference: 'RISK-7',
            reflection:
              'Mapped Condition to Subject and Recommendation to Mitigation for the Okta offboarding finding.',
            uploadedAt: '2026-08-10T12:00:00.000Z',
          },
        },
        error: null,
      },
      priorFinding: {
        data: {
          id: 'prior-1',
          control_id: 'ac-2',
          finding_state: 'accepted',
          student_narrative: 'Condition: Terminated users retain Okta access.',
          observation: { feedback: 'ok' },
          lesson: { title: 'Evidence Collection & Validation' },
        },
        error: null,
      },
      insertFinding: {
        data: {
          id: 'new-finding',
          tenant_id: 'ten',
          student_id: 'stu',
          track_id: 'track-grc',
          lesson_id: 'lesson-walk',
          control_id: 'ac-2',
          catalog_source: '{}',
          finding_state: 'accepted',
          observation: {},
          student_narrative: 'Mapped Condition to Subject...',
          dcwf_code: '722',
          created_at: '2026-08-10T12:01:00.000Z',
        },
        error: null,
      },
    });

    const result = await gradeToolWalkthroughLesson({
      supabase: supabase as never,
      lessonId: 'lesson-walk',
      studentId: 'stu',
      tenantId: 'ten',
    });

    expect(result.priorFindingId).toBe('prior-1');
    expect(result.aiFindingState).toBe('satisfied');
    expect(result.finding.control_id).toBe('ac-2');

    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('prior-1');
    expect(prompt).toContain('Terminated users retain Okta access');
    expect(prompt).toContain('RISK-7');
    expect(prompt).not.toMatch(/SP 800-30/);
  });

  it('fails when the prerequisite IAM finding is missing', async () => {
    const supabase = createSupabaseMock({
      lesson: {
        data: {
          id: 'lesson-walk',
          track_id: 'track-grc',
          dcwf_code: '722',
          title: 'Open-Source Tracking Workflows',
          lesson_type: 'tool_walkthrough',
          depends_on_lesson_id: 'lesson-iam',
          control_id: null,
        },
        error: null,
      },
      progress: {
        data: {
          id: 'progress-1',
          status: 'submitted',
          submission: {
            type: 'tool_walkthrough',
            storagePath: 'ten/stu/lesson/shot.png',
            externalReference: 'RISK-7',
            reflection: 'Enough characters for the reflection minimum length.',
            uploadedAt: '2026-08-10T12:00:00.000Z',
          },
        },
        error: null,
      },
      priorFinding: { data: null, error: null },
      insertFinding: { data: null, error: null },
    });

    await expect(
      gradeToolWalkthroughLesson({
        supabase: supabase as never,
        lessonId: 'lesson-walk',
        studentId: 'stu',
        tenantId: 'ten',
      })
    ).rejects.toThrow(/prerequisite IAM lab/i);

    expect(callClaudeGrading).not.toHaveBeenCalled();
  });
});
