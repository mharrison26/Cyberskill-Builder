import type { SupabaseClient } from '@supabase/supabase-js';

import {
  gradeSubmission,
  MissingAnthropicApiKeyError,
} from '@/lib/grading/gradeSubmission';
import {
  GRADING_FAILED_USER_MESSAGE,
  GRADING_TIMEOUT_USER_MESSAGE,
  resolveFailureTransition,
  type GradingJobStatus,
} from '@/lib/grading/gradingJob';
import type { CatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import type { ConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import type { ToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';
import { captureFeatureException } from '@/lib/observability/sentry';
import type { CCCERValues } from '@/types';

/**
 * Run AI grading for a single lesson_progress row that has already been
 * persisted and claimed by the grading worker (status = running).
 *
 * Failures update grading_job_status / grading_error so clients show an
 * explicit retry state instead of indefinite pending.
 */
export type TriggerGradingInput = {
  supabase: SupabaseClient;
  progressId: string;
  studentId: string;
  tenantId: string;
  lessonId: string;
  trackId: string;
  dcwfCode: string | null;
  submission:
    | CCCERValues
    | ToolWalkthroughSubmission
    | CatalogLabSubmission
    | ConceptualSubmission;
  /** Current attempt count after claim (1-based). */
  attemptCount?: number;
};

export type TriggerGradingResult = {
  status: 'completed' | 'failed';
  jobStatus: GradingJobStatus;
  findingId?: string;
  aiFindingState?: string;
  error?: string;
  willRetry?: boolean;
};

async function persistJobUpdate(
  supabase: SupabaseClient,
  progressId: string,
  values: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('lesson_progress')
    .update(values)
    .eq('id', progressId);

  if (error) {
    console.error('[grading] Failed to persist job update:', error, {
      progressId,
      values,
    });
    throw new Error(
      `Failed to persist grading job update for ${progressId}: ${error.message}`
    );
  }
}

export async function markGradingRunning(
  supabase: SupabaseClient,
  progressId: string,
  attemptCount: number
): Promise<void> {
  await persistJobUpdate(supabase, progressId, {
    grading_job_status: 'running',
    grading_started_at: new Date().toISOString(),
    grading_error: null,
    grading_attempt_count: attemptCount,
    grading_next_retry_at: null,
  });
}

export async function markGradingQueued(
  supabase: SupabaseClient,
  progressId: string,
  options?: { resetAttempts?: boolean; nextRetryAt?: string | null }
): Promise<void> {
  const values: Record<string, unknown> = {
    grading_job_status: 'queued',
    grading_error: null,
    graded_at: null,
    grading_next_retry_at: options?.nextRetryAt ?? null,
  };
  if (options?.resetAttempts) {
    values.grading_attempt_count = 0;
    values.grading_started_at = null;
  }
  await persistJobUpdate(supabase, progressId, values);
}

async function markGradingSucceeded(
  supabase: SupabaseClient,
  progressId: string
): Promise<void> {
  await persistJobUpdate(supabase, progressId, {
    grading_job_status: 'succeeded',
    grading_error: null,
    graded_at: new Date().toISOString(),
    grading_next_retry_at: null,
  });
}

async function markGradingFailed(
  supabase: SupabaseClient,
  progressId: string,
  args: {
    attemptCount: number;
    message: string;
    timedOut?: boolean;
  }
): Promise<{ willRetry: boolean; userMessage: string }> {
  const baseMessage = args.timedOut
    ? GRADING_TIMEOUT_USER_MESSAGE
    : `${GRADING_FAILED_USER_MESSAGE} (${args.message})`;

  const transition = resolveFailureTransition({
    attemptCount: args.attemptCount,
    message: baseMessage,
  });

  await persistJobUpdate(supabase, progressId, {
    grading_job_status: 'failed',
    grading_error: transition.message,
    grading_next_retry_at: transition.retryAt,
  });

  return {
    willRetry: !transition.terminal,
    userMessage: transition.message,
  };
}

export async function triggerGrading(
  input: TriggerGradingInput
): Promise<TriggerGradingResult> {
  const { supabase, progressId, studentId, lessonId, tenantId } = input;
  const attemptCount = input.attemptCount ?? 1;

  console.info('[grading] Worker pickup — running AI grading', {
    progressId,
    studentId,
    lessonId,
    attemptCount,
  });

  await markGradingRunning(supabase, progressId, attemptCount);

  try {
    const result = await gradeSubmission({
      supabase,
      lessonId,
      studentId,
      tenantId,
    });

    await markGradingSucceeded(supabase, progressId);

    console.info('[grading] Succeeded', {
      progressId,
      lessonId,
      findingId: result.finding.id,
    });

    return {
      status: 'completed',
      jobStatus: 'succeeded',
      findingId: result.finding.id,
      aiFindingState: result.aiFindingState,
    };
  } catch (error) {
    if (error instanceof MissingAnthropicApiKeyError) {
      console.warn('[grading] Failed: ANTHROPIC_API_KEY is not configured', {
        progressId,
        lessonId,
      });
      const message =
        'Grading failed: AI grading is not configured. Your answer is saved — retry once grading is enabled, or contact an admin.';
      // Missing key is not retryable until config changes — terminal.
      await persistJobUpdate(supabase, progressId, {
        grading_job_status: 'failed',
        grading_error: message,
        grading_next_retry_at: null,
      });
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'ai_grading_missing_key',
        extras: { progressId, lessonId },
      });
      return {
        status: 'failed',
        jobStatus: 'failed',
        error: message,
        willRetry: false,
      };
    }

    const message =
      error instanceof Error ? error.message : 'Unknown grading error';
    console.error('[grading] Failed:', message, { progressId, lessonId });
    captureFeatureException(error, {
      feature: 'scoring',
      pi: 'PI-03',
      operation: 'ai_grading_failed',
      extras: { progressId, lessonId, attemptCount },
    });

    const failure = await markGradingFailed(supabase, progressId, {
      attemptCount,
      message,
    });

    return {
      status: 'failed',
      jobStatus: 'failed',
      error: failure.userMessage,
      willRetry: failure.willRetry,
    };
  }
}

export async function markGradingTimedOut(
  supabase: SupabaseClient,
  progressId: string,
  attemptCount: number
): Promise<{ willRetry: boolean; userMessage: string }> {
  console.warn('[grading] Attempt timed out', { progressId, attemptCount });
  captureFeatureException(new Error('AI grading job timed out'), {
    feature: 'scoring',
    pi: 'PI-03',
    operation: 'ai_grading_timeout',
    level: 'error',
    extras: { progressId, attemptCount },
  });
  return markGradingFailed(supabase, progressId, {
    attemptCount,
    message: 'timeout',
    timedOut: true,
  });
}
