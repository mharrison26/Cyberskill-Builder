import type { AiFindingState } from '@/lib/grading/mapFindingState';
import { isLessonGradedStatus } from '@/lib/status';
import { isConceptualSubmission } from '@/lib/lessons/conceptualValidation';

export type LessonGradingPhase =
  'not_submitted' | 'pending' | 'failed' | 'completed';

export type LessonGradingStatusPayload = {
  progressId: string | null;
  status: string | null;
  phase: LessonGradingPhase;
  submission: unknown | null;
  memo: string | null;
  gradingError: string | null;
  submittedAt: string | null;
  gradingStartedAt: string | null;
  gradedAt: string | null;
  finding: {
    id: string;
    finding_state: string;
    observation: unknown;
    control_id: string;
    student_narrative: string | null;
    dcwf_code: string | null;
    created_at: string;
    is_public: boolean;
  } | null;
  aiFindingState?: AiFindingState;
};

export function resolveLessonGradingPhase(args: {
  status: string | null | undefined;
  gradingError: string | null | undefined;
  hasFinding: boolean;
}): LessonGradingPhase {
  const { status, gradingError, hasFinding } = args;

  if (isLessonGradedStatus(status) || hasFinding) {
    return 'completed';
  }

  if (status === 'submitted') {
    return gradingError?.trim() ? 'failed' : 'pending';
  }

  return 'not_submitted';
}

export function extractMemoFromSubmission(submission: unknown): string | null {
  if (isConceptualSubmission(submission) && submission.memo.trim()) {
    return submission.memo;
  }
  return null;
}
