import type { SupabaseClient } from '@supabase/supabase-js';

import { markGradingQueued } from '@/lib/grading/triggerGrading';

export type EnqueueGradingInput = {
  supabase: SupabaseClient;
  progressId: string;
  studentId: string;
  lessonId: string;
  /** When true, reset attempt counters (fresh submit / admin re-run). */
  resetAttempts?: boolean;
};

export type EnqueueGradingResult = {
  status: 'queued';
  progressId: string;
};

/**
 * Mark a persisted submission as ready for the grading worker.
 * Does not call the LLM — the cron/worker owns that.
 */
export async function enqueueGrading(
  input: EnqueueGradingInput
): Promise<EnqueueGradingResult> {
  const {
    supabase,
    progressId,
    studentId,
    lessonId,
    resetAttempts = true,
  } = input;

  console.info('[grading] Enqueue AI grading job', {
    progressId,
    studentId,
    lessonId,
    resetAttempts,
  });

  await markGradingQueued(supabase, progressId, {
    resetAttempts,
    nextRetryAt: null,
  });

  return { status: 'queued', progressId };
}

/**
 * Fire-and-forget kick of the grading worker so jobs do not wait for the
 * next cron tick. Failures are logged; the cron remains the safety net.
 */
export async function kickGradingWorker(args?: {
  origin?: string;
  progressId?: string;
}): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(
      '[grading] CRON_SECRET not set — cannot kick worker; cron/local process must pick up jobs'
    );
    return;
  }

  const origin =
    args?.origin ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!origin) {
    console.warn('[grading] No app origin available to kick grading worker');
    return;
  }

  const url = new URL('/api/cron/process-grading', origin);
  if (args?.progressId) {
    url.searchParams.set('progressId', args.progressId);
  }

  console.info('[grading] Kicking grading worker', {
    url: url.pathname + url.search,
    progressId: args?.progressId ?? null,
  });

  try {
    // Worker route ACKs quickly (202) and continues via waitUntil. Await the
    // small ack body — do not cancel the stream (cancel can abort the worker).
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[grading] Worker kick failed', {
        status: response.status,
        body: body.slice(0, 300),
      });
      return;
    }
    await response.text().catch(() => undefined);
    console.info('[grading] Worker kick accepted', {
      status: response.status,
      progressId: args?.progressId ?? null,
    });
  } catch (error) {
    console.error('[grading] Worker kick request error', error);
  }
}
