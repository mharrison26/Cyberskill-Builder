import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeAppOrigin, resolveAppOrigin } from '@/lib/auth/appUrl';
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
  request?: Request;
  progressId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const error =
      'CRON_SECRET not set — cannot kick worker; cron/local process must pick up jobs';
    console.warn(`[grading] ${error}`);
    return { ok: false, error };
  }

  const origin =
    normalizeAppOrigin(args?.origin) ?? resolveAppOrigin(args?.request) ?? null;

  if (!origin) {
    const error = 'No app origin available to kick grading worker';
    console.warn(`[grading] ${error}`);
    return { ok: false, error };
  }

  let url: URL;
  try {
    url = new URL('/api/cron/process-grading', origin);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid worker kick origin';
    console.error('[grading] Invalid origin for worker kick', {
      origin,
      message,
    });
    return { ok: false, error: message };
  }

  if (args?.progressId) {
    url.searchParams.set('progressId', args.progressId);
  }

  console.info('[grading] Kicking grading worker', {
    url: url.pathname + url.search,
    origin,
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
      const error = `Worker kick failed (${response.status}): ${body.slice(0, 300)}`;
      console.error('[grading] Worker kick failed', {
        status: response.status,
        body: body.slice(0, 300),
      });
      return { ok: false, error };
    }
    await response.text().catch(() => undefined);
    console.info('[grading] Worker kick accepted', {
      status: response.status,
      progressId: args?.progressId ?? null,
    });
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Worker kick request error';
    console.error('[grading] Worker kick request error', error);
    return { ok: false, error: message };
  }
}
