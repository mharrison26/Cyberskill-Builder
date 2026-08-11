import { waitUntil } from '@vercel/functions';
import { NextResponse } from 'next/server';

import { processGradingJobs } from '@/lib/grading/processGradingJobs';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
/** Allow enough time for a small batch of LLM grading calls. */
export const maxDuration = 60;

/**
 * AI grading worker (Vercel Cron + manual kick after enqueue).
 *
 * Auth: Authorization: Bearer $CRON_SECRET (or ?secret=)
 * Schedule: vercel.json daily on Hobby (`0 0 * * *`) — submit/grade routes
 * must kick this worker (or admin inline) so jobs do not wait for midnight.
 *
 * Optional query:
 * - `progressId` — process a specific lesson_progress row
 * - `sync=1` — await processing before responding (debug / one-off)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  const auth = request.headers.get('authorization');
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (bearer !== secret && querySecret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const progressId = url.searchParams.get('progressId') ?? undefined;
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  const sync = url.searchParams.get('sync') === '1';

  console.info('[grading] Cron/worker pickup', {
    progressId: progressId ?? null,
    limit: limit ?? null,
    sync,
  });

  try {
    const admin = createAdminClient();
    const options = {
      progressId,
      limit:
        typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined,
    };

    // Default: acknowledge immediately so submit/grade waitUntil kicks are not
    // pinned to the LLM call (and killed when the caller hits maxDuration).
    // Processing continues via waitUntil up to this route's maxDuration.
    if (!sync) {
      waitUntil(
        processGradingJobs(admin, options)
          .then((result) => {
            console.info('[grading] Cron/worker waitUntil complete', result);
          })
          .catch((error) => {
            console.error('[grading] Cron/worker waitUntil failed:', error);
          })
      );
      return NextResponse.json(
        { ok: true, accepted: true, progressId: progressId ?? null },
        { status: 202 }
      );
    }

    const result = await processGradingJobs(admin, options);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Grading worker failed';
    console.error('[grading] Worker crashed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
