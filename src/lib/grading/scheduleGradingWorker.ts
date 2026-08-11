import { waitUntil } from '@vercel/functions';

import { kickGradingWorker } from '@/lib/grading/enqueueGrading';
import { processGradingJobs } from '@/lib/grading/processGradingJobs';
import { getAppOrigin } from '@/lib/auth/appUrl';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Schedule background AI grading after a submission is durable.
 * Uses waitUntil so the worker kick survives after the HTTP response.
 *
 * Prefer HTTP kick of `/api/cron/process-grading` (maxDuration 60) so LLM
 * work is not bound to the short submit/grade caller. Falls back to
 * in-process processing when GRADING_PROCESS_INLINE=1 (local/dev).
 */
export async function scheduleGradingWorker(progressId: string): Promise<void> {
  if (process.env.GRADING_PROCESS_INLINE === '1') {
    try {
      const admin = createAdminClient();
      await processGradingJobs(admin, { progressId, limit: 1 });
    } catch (error) {
      console.error('[grading] Inline processing failed after enqueue:', error);
    }
    return;
  }

  const origin = await getAppOrigin();
  waitUntil(
    (async () => {
      try {
        await kickGradingWorker({ origin, progressId });
      } catch (error) {
        console.error(
          '[grading] Worker kick failed after enqueue; trying in-process fallback:',
          error
        );
        try {
          const admin = createAdminClient();
          await processGradingJobs(admin, { progressId, limit: 1 });
        } catch (fallbackError) {
          console.error(
            '[grading] In-process fallback also failed:',
            fallbackError
          );
        }
      }
    })()
  );
}
