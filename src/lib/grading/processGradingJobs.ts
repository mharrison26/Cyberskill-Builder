import type { SupabaseClient } from '@supabase/supabase-js';

import {
  GRADING_JOB_TIMEOUT_MS,
  GRADING_MAX_ATTEMPTS,
  isGradingJobTimedOut,
  type GradingJobStatus,
} from '@/lib/grading/gradingJob';
import {
  markGradingTimedOut,
  triggerGrading,
} from '@/lib/grading/triggerGrading';
import type { CatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';
import type { ConceptualSubmission } from '@/lib/lessons/conceptualValidation';
import type { ToolWalkthroughSubmission } from '@/lib/lessons/toolWalkthroughValidation';
import {
  captureFeatureException,
  captureFeatureMessage,
} from '@/lib/observability/sentry';
import type { CCCERValues } from '@/types';

type StoredLessonSubmission =
  | CCCERValues
  | ToolWalkthroughSubmission
  | CatalogLabSubmission
  | ConceptualSubmission;

type ProgressJobRow = {
  id: string;
  student_id: string;
  lesson_id: string;
  submission: unknown;
  grading_job_status: string | null;
  grading_attempt_count: number | null;
  grading_started_at: string | null;
  grading_next_retry_at: string | null;
  grading_last_alerted_at: string | null;
  submitted_at: string | null;
};

export type ProcessGradingJobsResult = {
  timedOut: number;
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  alerted: number;
  skipped: number;
};

const DEFAULT_BATCH_LIMIT = 5;

function asSubmission(value: unknown): StoredLessonSubmission | null {
  if (!value || typeof value !== 'object') return null;
  return value as StoredLessonSubmission;
}

async function loadLessonMeta(
  supabase: SupabaseClient,
  lessonId: string
): Promise<{ track_id: string; dcwf_code: string | null } | null> {
  const { data, error } = await supabase
    .from('lessons')
    .select('track_id, dcwf_code')
    .eq('id', lessonId)
    .maybeSingle();

  if (error || !data) {
    console.error('[grading] Failed to load lesson for job', {
      lessonId,
      error,
    });
    return null;
  }

  return {
    track_id: data.track_id as string,
    dcwf_code: (data.dcwf_code as string | null) ?? null,
  };
}

async function loadTenantId(
  supabase: SupabaseClient,
  studentId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', studentId)
    .maybeSingle();

  if (error || !data?.tenant_id) {
    console.error('[grading] Failed to load tenant for student', {
      studentId,
      error,
    });
    return null;
  }

  return data.tenant_id as string;
}

async function expireTimedOutJobs(
  supabase: SupabaseClient,
  now: Date
): Promise<number> {
  const { data: running, error } = await supabase
    .from('lesson_progress')
    .select(
      'id, grading_job_status, grading_attempt_count, grading_started_at, grading_last_alerted_at'
    )
    .eq('status', 'submitted')
    .eq('grading_job_status', 'running')
    .limit(50);

  if (error) {
    console.error('[grading] Failed to query running jobs:', error);
    return 0;
  }

  let timedOut = 0;
  for (const row of running ?? []) {
    if (
      !isGradingJobTimedOut({
        jobStatus: row.grading_job_status as GradingJobStatus,
        gradingStartedAt: row.grading_started_at,
        now,
        timeoutMs: GRADING_JOB_TIMEOUT_MS,
      })
    ) {
      continue;
    }

    const attemptCount =
      typeof row.grading_attempt_count === 'number'
        ? row.grading_attempt_count
        : 1;
    await markGradingTimedOut(supabase, row.id as string, attemptCount);
    timedOut += 1;
  }

  return timedOut;
}

async function alertStuckJobs(
  supabase: SupabaseClient,
  now: Date
): Promise<number> {
  const stuckCutoff = new Date(
    now.getTime() - GRADING_JOB_TIMEOUT_MS
  ).toISOString();
  const alertCooldownMs = 60 * 60 * 1000;

  const [{ data: running }, { data: terminalFailed }, { data: longQueued }] =
    await Promise.all([
      supabase
        .from('lesson_progress')
        .select(
          'id, student_id, lesson_id, grading_job_status, grading_started_at, submitted_at, grading_last_alerted_at, grading_attempt_count'
        )
        .eq('status', 'submitted')
        .eq('grading_job_status', 'running')
        .lt('grading_started_at', stuckCutoff)
        .limit(50),
      supabase
        .from('lesson_progress')
        .select(
          'id, student_id, lesson_id, grading_job_status, grading_started_at, submitted_at, grading_last_alerted_at, grading_attempt_count'
        )
        .eq('status', 'submitted')
        .eq('grading_job_status', 'failed')
        .is('grading_next_retry_at', null)
        .is('graded_at', null)
        .limit(50),
      supabase
        .from('lesson_progress')
        .select(
          'id, student_id, lesson_id, grading_job_status, grading_started_at, submitted_at, grading_last_alerted_at, grading_attempt_count'
        )
        .eq('status', 'submitted')
        .eq('grading_job_status', 'queued')
        .lt('submitted_at', stuckCutoff)
        .is('graded_at', null)
        .limit(50),
    ]);

  const stuck = [
    ...(running ?? []),
    ...(terminalFailed ?? []),
    ...(longQueued ?? []),
  ];
  const seen = new Set<string>();
  let alerted = 0;

  for (const row of stuck) {
    const id = row.id as string;
    if (seen.has(id)) continue;
    seen.add(id);

    const lastAlerted = row.grading_last_alerted_at as string | null;
    if (
      lastAlerted &&
      now.getTime() - Date.parse(lastAlerted) < alertCooldownMs
    ) {
      continue;
    }

    captureFeatureMessage('AI grading job stuck', {
      feature: 'scoring',
      pi: 'PI-03',
      operation: 'ai_grading_stuck',
      level: 'error',
      extras: {
        progressId: id,
        lessonId: row.lesson_id,
        jobStatus: row.grading_job_status,
        attemptCount: row.grading_attempt_count,
        submittedAt: row.submitted_at,
        gradingStartedAt: row.grading_started_at,
      },
    });

    await supabase
      .from('lesson_progress')
      .update({ grading_last_alerted_at: now.toISOString() })
      .eq('id', id);

    alerted += 1;
  }

  return alerted;
}

async function claimNextJobs(
  supabase: SupabaseClient,
  now: Date,
  limit: number,
  progressId?: string
): Promise<ProgressJobRow[]> {
  const selectCols =
    'id, student_id, lesson_id, submission, grading_job_status, grading_attempt_count, grading_started_at, grading_next_retry_at, grading_last_alerted_at, submitted_at';

  if (progressId) {
    const { data, error } = await supabase
      .from('lesson_progress')
      .select(selectCols)
      .eq('id', progressId)
      .eq('status', 'submitted')
      .is('graded_at', null)
      .maybeSingle();

    if (error) {
      console.error('[grading] Failed to load grading job:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'ai_grading_claim',
      });
      return [];
    }

    if (!data) return [];
    const row = data as ProgressJobRow;
    if (
      row.grading_job_status === 'queued' ||
      row.grading_job_status === 'failed' ||
      row.grading_job_status === 'running'
    ) {
      return [row];
    }
    return [];
  }

  const [
    { data: queued, error: queuedError },
    { data: failed, error: failedError },
  ] = await Promise.all([
    supabase
      .from('lesson_progress')
      .select(selectCols)
      .eq('status', 'submitted')
      .eq('grading_job_status', 'queued')
      .is('graded_at', null)
      .order('submitted_at', { ascending: true })
      .limit(limit),
    supabase
      .from('lesson_progress')
      .select(selectCols)
      .eq('status', 'submitted')
      .eq('grading_job_status', 'failed')
      .is('graded_at', null)
      .lt('grading_attempt_count', GRADING_MAX_ATTEMPTS)
      .lte('grading_next_retry_at', now.toISOString())
      .order('grading_next_retry_at', { ascending: true })
      .limit(limit),
  ]);

  if (queuedError) {
    console.error('[grading] Failed to claim queued jobs:', queuedError);
    captureFeatureException(queuedError, {
      feature: 'scoring',
      pi: 'PI-03',
      operation: 'ai_grading_claim',
    });
  }
  if (failedError) {
    console.error('[grading] Failed to claim retry jobs:', failedError);
    captureFeatureException(failedError, {
      feature: 'scoring',
      pi: 'PI-03',
      operation: 'ai_grading_claim',
    });
  }

  const merged = [
    ...((queued ?? []) as ProgressJobRow[]),
    ...((failed ?? []) as ProgressJobRow[]),
  ];
  const seen = new Set<string>();
  const unique: ProgressJobRow[] = [];
  for (const row of merged) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Process queued / retryable AI grading jobs.
 * Safe to call from Vercel Cron or a manual kick after enqueue.
 */
export async function processGradingJobs(
  supabase: SupabaseClient,
  options?: { limit?: number; progressId?: string }
): Promise<ProcessGradingJobsResult> {
  const now = new Date();
  const limit = options?.limit ?? DEFAULT_BATCH_LIMIT;

  console.info('[grading] Worker starting batch', {
    limit,
    progressId: options?.progressId ?? null,
  });

  const timedOut = await expireTimedOutJobs(supabase, now);
  const alerted = await alertStuckJobs(supabase, now);

  const jobs = await claimNextJobs(supabase, now, limit, options?.progressId);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let retried = 0;
  let skipped = 0;

  for (const job of jobs) {
    const submission = asSubmission(job.submission);
    if (!submission) {
      console.error('[grading] Skipping job with missing submission', {
        progressId: job.id,
      });
      skipped += 1;
      continue;
    }

    const lesson = await loadLessonMeta(supabase, job.lesson_id);
    const tenantId = await loadTenantId(supabase, job.student_id);
    if (!lesson || !tenantId) {
      skipped += 1;
      continue;
    }

    const nextAttempt = (job.grading_attempt_count ?? 0) + 1;
    if (nextAttempt > GRADING_MAX_ATTEMPTS && !options?.progressId) {
      skipped += 1;
      continue;
    }

    // Admin/manual kick of a stuck running job: treat as timeout then retry.
    if (
      job.grading_job_status === 'running' &&
      options?.progressId &&
      isGradingJobTimedOut({
        jobStatus: 'running',
        gradingStartedAt: job.grading_started_at,
        now,
      })
    ) {
      await markGradingTimedOut(
        supabase,
        job.id,
        job.grading_attempt_count ?? 1
      );
    }

    const result = await triggerGrading({
      supabase,
      progressId: job.id,
      studentId: job.student_id,
      tenantId,
      lessonId: job.lesson_id,
      trackId: lesson.track_id,
      dcwfCode: lesson.dcwf_code,
      submission,
      attemptCount: Math.min(nextAttempt, GRADING_MAX_ATTEMPTS),
    });

    processed += 1;
    if (result.status === 'completed') {
      succeeded += 1;
    } else {
      failed += 1;
      if (result.willRetry) retried += 1;
    }
  }

  console.info('[grading] Worker batch complete', {
    timedOut,
    processed,
    succeeded,
    failed,
    retried,
    alerted,
    skipped,
  });

  return {
    timedOut,
    processed,
    succeeded,
    failed,
    retried,
    alerted,
    skipped,
  };
}
