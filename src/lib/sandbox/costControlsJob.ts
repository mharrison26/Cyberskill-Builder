/**
 * Scheduled sandbox cost-control job helpers (reclaim idle VMs, daily usage, spend warn).
 * Invoked by scripts/sandbox-cost-controls.ts (GitHub Actions cron) with the service role.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  priorUtcDateString,
  projectMonthlySpend,
  utcDateString,
  warnIfMonthlySpendOverThreshold,
  type MonthlySpendProjection,
} from '@/lib/sandbox/costControls';
import {
  destroySandboxMachine,
  FlyMachinesError,
} from '@/lib/sandbox/flyMachines';

type RunningSessionRow = {
  id: string;
  tenant_id: string;
  machine_id: string;
  started_at: string;
  expires_at: string;
  status: string;
};

export type ReclaimResult = {
  examined: number;
  reclaimed: number;
  errors: number;
};

function durationSeconds(startedAt: string, stoppedAt: Date): number {
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((stoppedAt.getTime() - startMs) / 1000));
}

/**
 * Force-terminate machines for sessions past expires_at that are still status=running.
 * Closes session rows with duration_seconds + stop_reason=idle_timeout.
 */
export async function reclaimExpiredSandboxSessions(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<ReclaimResult> {
  const { data, error } = await supabase
    .from('sandbox_sessions')
    .select('id, tenant_id, machine_id, started_at, expires_at, status')
    .eq('status', 'running')
    .lte('expires_at', now.toISOString());

  if (error) {
    console.error('reclaimExpiredSandboxSessions query failed:', error);
    throw new Error('Failed to load expired sandbox sessions');
  }

  const sessions = (data ?? []) as RunningSessionRow[];
  let reclaimed = 0;
  let errors = 0;

  for (const session of sessions) {
    try {
      try {
        await destroySandboxMachine(session.machine_id);
      } catch (destroyError) {
        if (!(
          destroyError instanceof FlyMachinesError &&
          destroyError.status === 404
        )) {
          console.error(
            'Fly destroy during reclaim failed:',
            session.machine_id,
            destroyError
          );
        }
      }

      const stoppedAt = new Date();
      const duration = durationSeconds(session.started_at, stoppedAt);
      const { error: updateError } = await supabase
        .from('sandbox_sessions')
        .update({
          status: 'expired',
          stopped_at: stoppedAt.toISOString(),
          duration_seconds: duration,
          stop_reason: 'idle_timeout',
        })
        .eq('id', session.id)
        .eq('status', 'running');

      if (updateError) {
        console.error(
          'sandbox_sessions reclaim update failed:',
          session.id,
          updateError
        );
        errors += 1;
        continue;
      }

      reclaimed += 1;
      console.info(
        JSON.stringify({
          event: 'sandbox_session_reclaim',
          sessionId: session.id,
          tenantId: session.tenant_id,
          machineId: session.machine_id,
          durationSeconds: duration,
          expiresAt: session.expires_at,
        })
      );
    } catch (sessionError) {
      console.error('reclaim session failed:', session.id, sessionError);
      errors += 1;
    }
  }

  return { examined: sessions.length, reclaimed, errors };
}

export type UsageAggregateRow = {
  tenant_id: string;
  machine_hours: number;
  machine_count: number;
};

/**
 * Attribute a session's wall-clock seconds to a UTC calendar day by overlap.
 * Sessions with no stopped_at use `now` as the end bound.
 */
export function sessionHoursOnUtcDate(
  startedAt: string,
  stoppedAt: string | null,
  usageDate: string,
  now: Date = new Date()
): number {
  const startMs = new Date(startedAt).getTime();
  const endMs = stoppedAt ? new Date(stoppedAt).getTime() : now.getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return 0;
  }

  const dayStart = Date.parse(`${usageDate}T00:00:00.000Z`);
  const dayEnd = dayStart + 86_400_000;
  const overlapStart = Math.max(startMs, dayStart);
  const overlapEnd = Math.min(endMs, dayEnd);
  if (overlapEnd <= overlapStart) return 0;
  return (overlapEnd - overlapStart) / 3_600_000;
}

type SessionForUsage = {
  tenant_id: string;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
};

/**
 * Aggregate machine-hours per tenant for a UTC usage_date and upsert sandbox_usage.
 */
export async function upsertSandboxUsageForDate(
  supabase: SupabaseClient,
  usageDate: string,
  now: Date = new Date()
): Promise<{ tenants: number; rows: UsageAggregateRow[] }> {
  const dayStart = `${usageDate}T00:00:00.000Z`;
  const nextDay = new Date(Date.parse(dayStart) + 86_400_000).toISOString();

  // Sessions that overlap the UTC day: started before day end AND (still open or stopped after day start).
  const { data, error } = await supabase
    .from('sandbox_sessions')
    .select('tenant_id, started_at, stopped_at, duration_seconds')
    .lt('started_at', nextDay)
    .or(`stopped_at.is.null,stopped_at.gte."${dayStart}"`);

  if (error) {
    console.error('upsertSandboxUsageForDate query failed:', error);
    throw new Error('Failed to load sandbox sessions for usage aggregate');
  }

  const byTenant = new Map<string, { hours: number; count: number }>();

  for (const row of (data ?? []) as SessionForUsage[]) {
    const hours = sessionHoursOnUtcDate(
      row.started_at,
      row.stopped_at,
      usageDate,
      now
    );
    if (hours <= 0) continue;
    const current = byTenant.get(row.tenant_id) ?? { hours: 0, count: 0 };
    current.hours += hours;
    current.count += 1;
    byTenant.set(row.tenant_id, current);
  }

  const rows: UsageAggregateRow[] = [];
  const updatedAt = now.toISOString();

  for (const [tenantId, agg] of Array.from(byTenant.entries())) {
    const machineHours = Number(agg.hours.toFixed(4));
    const payload = {
      tenant_id: tenantId,
      usage_date: usageDate,
      machine_hours: machineHours,
      machine_count: agg.count,
      updated_at: updatedAt,
    };

    const { error: upsertError } = await supabase
      .from('sandbox_usage')
      .upsert(payload, { onConflict: 'tenant_id,usage_date' });

    if (upsertError) {
      console.error('sandbox_usage upsert failed:', tenantId, upsertError);
      throw new Error('Failed to upsert sandbox_usage');
    }

    rows.push({
      tenant_id: tenantId,
      machine_hours: machineHours,
      machine_count: agg.count,
    });
  }

  console.info(
    JSON.stringify({
      event: 'sandbox_usage_aggregate',
      usageDate,
      tenants: rows.length,
      totalMachineHours: Number(
        rows.reduce((sum, r) => sum + r.machine_hours, 0).toFixed(4)
      ),
    })
  );

  return { tenants: rows.length, rows };
}

/**
 * Sum MTD machine-hours from sandbox_usage (plus optional live today overlap)
 * and warn if projected monthly spend exceeds the threshold.
 */
export async function checkMonthlySpendWarning(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<MonthlySpendProjection> {
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const today = utcDateString(now);

  const { data, error } = await supabase
    .from('sandbox_usage')
    .select('machine_hours, usage_date')
    .gte('usage_date', monthStart)
    .lte('usage_date', today);

  if (error) {
    console.error('checkMonthlySpendWarning query failed:', error);
    throw new Error('Failed to load sandbox_usage for spend warning');
  }

  let machineHoursMtd = 0;
  for (const row of data ?? []) {
    const hours = Number(row.machine_hours);
    if (Number.isFinite(hours)) machineHoursMtd += hours;
  }

  // Include today's live overlap if usage row is missing or stale (sessions still open).
  const hasToday = (data ?? []).some((r) => r.usage_date === today);
  if (!hasToday) {
    const live = await upsertSandboxUsageForDate(supabase, today, now);
    for (const row of live.rows) {
      machineHoursMtd += row.machine_hours;
    }
  }

  const projection = projectMonthlySpend(machineHoursMtd, now);
  warnIfMonthlySpendOverThreshold(projection);

  console.info(
    JSON.stringify({
      event: 'sandbox_monthly_spend_check',
      ...projection,
      machineHoursMtd: Number(projection.machineHoursMtd.toFixed(4)),
      mtdSpendUsd: Number(projection.mtdSpendUsd.toFixed(4)),
      projectedMonthlySpendUsd: Number(
        projection.projectedMonthlySpendUsd.toFixed(4)
      ),
    })
  );

  return projection;
}

export type CostControlsJobResult = {
  reclaimed: ReclaimResult;
  usageDate: string;
  usageTenants: number;
  spend: MonthlySpendProjection;
};

/** Full cron pass: reclaim → prior-day usage upsert → monthly spend warning. */
export async function runSandboxCostControlsJob(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<CostControlsJobResult> {
  const reclaimed = await reclaimExpiredSandboxSessions(supabase, now);
  const usageDate = priorUtcDateString(now);
  const usage = await upsertSandboxUsageForDate(supabase, usageDate, now);
  // Also refresh today's partial row so MTD projection stays current.
  await upsertSandboxUsageForDate(supabase, utcDateString(now), now);
  const spend = await checkMonthlySpendWarning(supabase, now);

  return {
    reclaimed,
    usageDate,
    usageTenants: usage.tenants,
    spend,
  };
}
