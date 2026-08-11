import {
  GRADING_JOB_TIMEOUT_MS,
  GRADING_TIMEOUT_USER_MESSAGE,
  isGradingJobStatus,
  isGradingJobTimedOut,
  type GradingJobStatus,
} from '@/lib/grading/gradingJob';
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
  gradingJobStatus: GradingJobStatus | null;
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
  gradingJobStatus?: string | null | undefined;
  gradingStartedAt?: string | null | undefined;
  now?: Date;
}): LessonGradingPhase {
  const {
    status,
    gradingError,
    hasFinding,
    gradingJobStatus,
    gradingStartedAt,
    now = new Date(),
  } = args;

  if (isLessonGradedStatus(status) || hasFinding) {
    return 'completed';
  }

  if (status === 'submitted') {
    if (gradingError?.trim() || gradingJobStatus === 'failed') {
      return 'failed';
    }

    // Only auto-fail wall-clock timeouts for attempts that actually started.
    // Long-queued jobs stay pending so a delayed worker/cron can still claim them;
    // stuck-queue alerting lives in processGradingJobs.
    if (
      isGradingJobTimedOut({
        jobStatus: isGradingJobStatus(gradingJobStatus)
          ? gradingJobStatus
          : null,
        gradingStartedAt,
        now,
        timeoutMs: GRADING_JOB_TIMEOUT_MS,
      })
    ) {
      return 'failed';
    }

    return 'pending';
  }

  return 'not_submitted';
}

export function resolveDisplayedGradingError(args: {
  phase: LessonGradingPhase;
  gradingError: string | null | undefined;
}): string | null {
  if (args.phase !== 'failed') return args.gradingError?.trim() || null;
  return (
    args.gradingError?.trim() || GRADING_TIMEOUT_USER_MESSAGE
  );
}

export function extractMemoFromSubmission(submission: unknown): string | null {
  if (isConceptualSubmission(submission) && submission.memo.trim()) {
    return submission.memo;
  }
  return null;
}
