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
 * Schedule: vercel.json every minute
 *
 * Optional query: ?progressId=… to process a specific lesson_progress row.
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

  console.info('[grading] Cron/worker pickup', {
    progressId: progressId ?? null,
    limit: limit ?? null,
  });

  try {
    const admin = createAdminClient();
    const result = await processGradingJobs(admin, {
      progressId,
      limit:
        typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Grading worker failed';
    console.error('[grading] Worker crashed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
