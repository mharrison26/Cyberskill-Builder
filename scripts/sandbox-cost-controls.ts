/**
 * Fly sandbox cost-controls cron job.
 *
 * 1. Force-terminates machines idle past expires_at and closes sandbox_sessions
 * 2. Upserts prior-day (+ today partial) machine-hours into sandbox_usage
 * 3. console.warn when projected monthly spend exceeds FLY_MONTHLY_SPEND_WARNING_USD
 *
 * Required secrets / env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FLY_API_TOKEN
 *   FLY_APP_NAME
 *   FLY_SANDBOX_IMAGE          (validated by getFlyMachinesConfig on destroy path)
 *
 * Optional:
 *   FLY_API_HOSTNAME
 *   FLY_IDLE_TIMEOUT_MINUTES
 *   FLY_MAX_ACTIVE_SANDBOXES_PER_TENANT
 *   FLY_SANDBOX_HOURLY_RATE_USD       (default 0.02)
 *   FLY_MONTHLY_SPEND_WARNING_USD     (default 50)
 *
 * Usage:
 *   export PATH="/Users/Lion/.local/node/bin:$PATH"
 *   npm run sandbox:cost-controls
 *
 * Scheduled via .github/workflows/sandbox-cost-controls.yml (hourly cron).
 */

import { runSandboxCostControlsJob } from '@/lib/sandbox/costControlsJob';
import { createAdminClient } from '@/lib/supabase/admin';

async function main() {
  const supabase = createAdminClient();
  const result = await runSandboxCostControlsJob(supabase);

  console.info(
    JSON.stringify({
      event: 'sandbox_cost_controls_complete',
      reclaimedExamined: result.reclaimed.examined,
      reclaimed: result.reclaimed.reclaimed,
      reclaimErrors: result.reclaimed.errors,
      usageDate: result.usageDate,
      usageTenants: result.usageTenants,
      projectedMonthlySpendUsd: Number(
        result.spend.projectedMonthlySpendUsd.toFixed(4)
      ),
      overThreshold: result.spend.overThreshold,
    })
  );
}

main().catch((error) => {
  console.error('sandbox-cost-controls failed:', error);
  process.exitCode = 1;
});
