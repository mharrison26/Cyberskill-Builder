import { waitUntil } from '@vercel/functions';

import {
  kickGradingWorker,
} from '@/lib/grading/enqueueGrading';
import { processGradingJobs } from '@/lib/grading/processGradingJobs';
import { getAppOrigin } from '@/lib/auth/appUrl';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Schedule background AI grading after a submission is durable.
 * Uses waitUntil so the worker kick survives after the HTTP response.
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
    kickGradingWorker({ origin, progressId }).catch((error) => {
      console.error('[grading] Worker kick failed after enqueue:', error);
    })
  );
}
