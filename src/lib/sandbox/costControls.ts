/**
 * Fly sandbox cost controls: per-tenant concurrency + spend projection helpers.
 *
 * Env (server-only):
 *   FLY_MAX_ACTIVE_SANDBOXES_PER_TENANT – concurrent running sandboxes (default 2)
 *   FLY_SANDBOX_HOURLY_RATE_USD         – estimated $/machine-hour (default 0.02)
 *   FLY_MONTHLY_SPEND_WARNING_USD       – warn when projected monthly spend exceeds
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_MAX_ACTIVE = 2;
const DEFAULT_HOURLY_RATE_USD = 0.02;
const DEFAULT_MONTHLY_WARNING_USD = 50;

export type TenantConcurrencyResult =
  | { ok: true; activeCount: number; maxActive: number }
  | {
      ok: false;
      activeCount: number;
      maxActive: number;
      reason: string;
    };

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeFloat(
  raw: string | undefined,
  fallback: number
): number {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getMaxActiveSandboxesPerTenant(): number {
  return parsePositiveInt(
    process.env.FLY_MAX_ACTIVE_SANDBOXES_PER_TENANT,
    DEFAULT_MAX_ACTIVE
  );
}

export function getSandboxHourlyRateUsd(): number {
  return parseNonNegativeFloat(
    process.env.FLY_SANDBOX_HOURLY_RATE_USD,
    DEFAULT_HOURLY_RATE_USD
  );
}

export function getMonthlySpendWarningUsd(): number {
  return parseNonNegativeFloat(
    process.env.FLY_MONTHLY_SPEND_WARNING_USD,
    DEFAULT_MONTHLY_WARNING_USD
  );
}

/**
 * Count tenant sandboxes that are still active: status=running and not past expires_at.
 */
export async function countActiveTenantSandboxes(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<number> {
  const { count, error } = await supabase
    .from('sandbox_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'running')
    .gt('expires_at', now.toISOString());

  if (error) {
    console.error('countActiveTenantSandboxes failed:', error);
    throw new Error('Failed to count active sandbox sessions');
  }

  return count ?? 0;
}

/**
 * Refuse a new launch when the tenant already has N active sandboxes.
 * Call only when starting a *new* machine (not when reusing an existing session).
 */
export async function assertTenantSandboxConcurrency(
  supabase: SupabaseClient,
  tenantId: string,
  now: Date = new Date()
): Promise<TenantConcurrencyResult> {
  const maxActive = getMaxActiveSandboxesPerTenant();
  const activeCount = await countActiveTenantSandboxes(supabase, tenantId, now);

  if (activeCount >= maxActive) {
    return {
      ok: false,
      activeCount,
      maxActive,
      reason: `Tenant already has ${activeCount} active sandbox(es); limit is ${maxActive}`,
    };
  }

  return { ok: true, activeCount, maxActive };
}

export type MonthlySpendProjection = {
  monthKey: string;
  machineHoursMtd: number;
  hourlyRateUsd: number;
  mtdSpendUsd: number;
  projectedMonthlySpendUsd: number;
  warningThresholdUsd: number;
  overThreshold: boolean;
};

/** UTC YYYY-MM-DD for a Date. */
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Previous UTC calendar day as YYYY-MM-DD. */
export function priorUtcDateString(now: Date = new Date()): string {
  const prior = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1)
  );
  return utcDateString(prior);
}

/**
 * Project month-end spend from MTD machine-hours (linear day-of-month extrapolation).
 */
export function projectMonthlySpend(
  machineHoursMtd: number,
  now: Date = new Date(),
  hourlyRateUsd: number = getSandboxHourlyRateUsd(),
  warningThresholdUsd: number = getMonthlySpendWarningUsd()
): MonthlySpendProjection {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const mtdSpendUsd = machineHoursMtd * hourlyRateUsd;
  const projectedMonthlySpendUsd =
    dayOfMonth > 0 ? mtdSpendUsd * (daysInMonth / dayOfMonth) : mtdSpendUsd;

  return {
    monthKey: `${year}-${String(month + 1).padStart(2, '0')}`,
    machineHoursMtd,
    hourlyRateUsd,
    mtdSpendUsd,
    projectedMonthlySpendUsd,
    warningThresholdUsd,
    overThreshold: projectedMonthlySpendUsd > warningThresholdUsd,
  };
}

/**
 * Log a warning when projected monthly sandbox spend exceeds the configured threshold.
 */
export function warnIfMonthlySpendOverThreshold(
  projection: MonthlySpendProjection
): void {
  if (!projection.overThreshold) return;

  console.warn(
    JSON.stringify({
      event: 'sandbox_monthly_spend_warning',
      month: projection.monthKey,
      machineHoursMtd: Number(projection.machineHoursMtd.toFixed(4)),
      hourlyRateUsd: projection.hourlyRateUsd,
      mtdSpendUsd: Number(projection.mtdSpendUsd.toFixed(4)),
      projectedMonthlySpendUsd: Number(
        projection.projectedMonthlySpendUsd.toFixed(4)
      ),
      warningThresholdUsd: projection.warningThresholdUsd,
      message: `Projected monthly Fly sandbox spend $${projection.projectedMonthlySpendUsd.toFixed(2)} exceeds threshold $${projection.warningThresholdUsd.toFixed(2)}`,
    })
  );
}
