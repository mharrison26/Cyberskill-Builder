import { NextResponse } from 'next/server';

import { captureFeatureException } from '@/lib/observability/sentry';
import { assertTenantSandboxConcurrency } from '@/lib/sandbox/costControls';
import { assertSandboxEligible } from '@/lib/sandbox/eligibility';
import {
  destroySandboxMachine,
  execSandboxMachine,
  FlyMachinesError,
  getDefaultIdleTimeoutMinutes,
  launchSandboxMachine,
  waitForSandboxMachine,
} from '@/lib/sandbox/flyMachines';
import {
  buildPreloadPythonSource,
  extractPreloadFiles,
  extractPreloadModes,
  pythonExecCommand,
} from '@/lib/sandbox/guestState';
import { buildTerminalWebSocketUrl } from '@/lib/sandbox/terminalUrl';
import { createClient } from '@/lib/supabase/server';
import { resolveSubmitTicketContext } from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

type SandboxSessionRow = {
  id: string;
  ticket_id: string;
  student_id: string;
  machine_id: string;
  machine_name: string | null;
  region: string | null;
  status: 'running' | 'stopped' | 'expired';
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  idle_timeout_minutes: number;
  expires_at: string;
  stop_reason: string | null;
};

type StopReason = 'user_stop' | 'idle_timeout' | 'replaced' | 'error';

function durationSeconds(startedAt: string, stoppedAt: Date): number {
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((stoppedAt.getTime() - startMs) / 1000));
}

async function loadRunningSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  ticketId: string
): Promise<SandboxSessionRow | null> {
  const { data, error } = await supabase
    .from('sandbox_sessions')
    .select(
      'id, ticket_id, student_id, machine_id, machine_name, region, status, started_at, stopped_at, duration_seconds, idle_timeout_minutes, expires_at, stop_reason'
    )
    .eq('student_id', studentId)
    .eq('ticket_id', ticketId)
    .eq('status', 'running')
    .maybeSingle();

  if (error) {
    console.error('sandbox_sessions load failed:', error);
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'load_session',
      ticketId,
      extras: { studentId },
    });
    throw new Error('Failed to load sandbox session');
  }

  return (data as SandboxSessionRow | null) ?? null;
}

/**
 * Close a running session: destroy the Fly machine and persist duration for PI-12.
 * Machine destroy failures are logged but the session row is still closed so we
 * do not leak open billing windows in the DB.
 */
async function closeSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: SandboxSessionRow,
  reason: StopReason
): Promise<SandboxSessionRow> {
  try {
    await destroySandboxMachine(session.machine_id);
  } catch (error) {
    // 404 = already gone; still finalize the log row.
    if (!(error instanceof FlyMachinesError && error.status === 404)) {
      console.error('Fly machine destroy failed:', error);
      captureFeatureException(error, {
        feature: 'sandbox',
        pi: 'PI-05',
        operation: 'destroy_machine',
        ticketId: session.ticket_id,
        extras: {
          sessionId: session.id,
          machineId: session.machine_id,
          stopReason: reason,
        },
      });
    }
  }

  const stoppedAt = new Date();
  const status = reason === 'idle_timeout' ? 'expired' : 'stopped';
  const duration = durationSeconds(session.started_at, stoppedAt);

  const { data, error } = await supabase
    .from('sandbox_sessions')
    .update({
      status,
      stopped_at: stoppedAt.toISOString(),
      duration_seconds: duration,
      stop_reason: reason,
    })
    .eq('id', session.id)
    .select(
      'id, ticket_id, student_id, machine_id, machine_name, region, status, started_at, stopped_at, duration_seconds, idle_timeout_minutes, expires_at, stop_reason'
    )
    .single();

  if (error || !data) {
    console.error('sandbox_sessions stop update failed:', error);
    captureFeatureException(
      error ?? new Error('sandbox_sessions stop update returned no row'),
      {
        feature: 'sandbox',
        pi: 'PI-05',
        operation: 'record_stop',
        ticketId: session.ticket_id,
        extras: { sessionId: session.id, stopReason: reason },
      }
    );
    throw new Error('Failed to record sandbox stop');
  }

  console.info(
    JSON.stringify({
      event: 'sandbox_session_stop',
      sessionId: session.id,
      ticketId: session.ticket_id,
      studentId: session.student_id,
      machineId: session.machine_id,
      reason,
      durationSeconds: duration,
      startedAt: session.started_at,
      stoppedAt: stoppedAt.toISOString(),
    })
  );

  return data as SandboxSessionRow;
}

function sessionResponse(
  session: SandboxSessionRow,
  appName: string,
  extras?: Record<string, unknown>
) {
  const terminal = buildTerminalWebSocketUrl(appName, session.machine_id);
  return {
    sessionId: session.id,
    machineId: session.machine_id,
    machineName: session.machine_name,
    region: session.region,
    status: session.status,
    startedAt: session.started_at,
    expiresAt: session.expires_at,
    idleTimeoutMinutes: session.idle_timeout_minutes,
    websocketUrl: terminal.websocketUrl,
    flyForceInstanceId: terminal.flyForceInstanceId,
    /**
     * xterm.js: `const ws = new WebSocket(websocketUrl)`.
     * Prefer flyForceInstanceId as Fly-Force-Instance-Id when connecting through
     * a proxy that can set headers; query `machine_id` is embedded in websocketUrl.
     */
    ...extras,
  };
}

/**
 * POST /api/tickets/[ticketId]/sandbox
 * Start (or reuse) a Fly Machines sandbox for an eligible Tier 2+ shell ticket.
 *
 * DELETE /api/tickets/[ticketId]/sandbox
 * Stop the student's running sandbox and log duration_seconds for PI-12.
 *
 * Gate: see src/lib/sandbox/eligibility.ts (tier >= 2 + sysadmin/helpdesk types).
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const eligibility = assertSandboxEligible(context.ticket);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.reason }, { status: 403 });
  }

  let existing: SandboxSessionRow | null;
  try {
    existing = await loadRunningSession(supabase, context.appUser.id, ticketId);
  } catch (error) {
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'load_session_post',
      ticketId,
      ticketType: context.ticket.ticket_type,
    });
    return NextResponse.json(
      { error: 'Failed to load sandbox session' },
      { status: 500 }
    );
  }

  const now = new Date();

  if (existing) {
    const expired = new Date(existing.expires_at).getTime() <= now.getTime();
    if (!expired) {
      const appName = process.env.FLY_APP_NAME?.trim();
      if (!appName) {
        return NextResponse.json(
          { error: 'FLY_APP_NAME is not configured' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        sessionResponse(existing, appName, { reused: true }),
        { status: 200 }
      );
    }

    try {
      await closeSession(supabase, existing, 'idle_timeout');
    } catch (error) {
      console.error('Failed to expire idle sandbox session:', error);
      captureFeatureException(error, {
        feature: 'sandbox',
        pi: 'PI-05',
        operation: 'expire_idle_session',
        ticketId,
        ticketType: context.ticket.ticket_type,
        extras: { sessionId: existing.id },
      });
      return NextResponse.json(
        { error: 'Failed to recycle expired sandbox' },
        { status: 500 }
      );
    }
  }

  // Per-tenant concurrency guard (default 2). Skip when reusing above.
  let concurrency;
  try {
    concurrency = await assertTenantSandboxConcurrency(
      supabase,
      context.appUser.tenant_id,
      now
    );
  } catch (error) {
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'concurrency_check',
      ticketId,
      ticketType: context.ticket.ticket_type,
      extras: { tenantId: context.appUser.tenant_id },
    });
    return NextResponse.json(
      { error: 'Failed to check sandbox concurrency' },
      { status: 500 }
    );
  }
  if (!concurrency.ok) {
    return NextResponse.json(
      {
        error: concurrency.reason,
        activeCount: concurrency.activeCount,
        maxActive: concurrency.maxActive,
      },
      { status: 429 }
    );
  }

  const idleTimeoutMinutes = getDefaultIdleTimeoutMinutes();

  const initialState = (context.ticket.initial_state ?? {}) as Record<
    string,
    unknown
  >;
  const preloadFiles = extractPreloadFiles(initialState);
  const preloadModes = extractPreloadModes(initialState);

  let launched;
  try {
    launched = await launchSandboxMachine({
      ticketId,
      studentId: context.appUser.id,
      idleTimeoutMinutes,
      env: {
        SANDBOX_SCENARIO:
          typeof initialState.scenario === 'string'
            ? initialState.scenario
            : context.ticket.ticket_type,
      },
    });
    // Best-effort wait so the websocket is more likely ready for the client.
    try {
      await waitForSandboxMachine(launched.machine.id, {
        state: 'started',
        timeoutSeconds: 45,
      });
    } catch (waitError) {
      console.warn('sandbox machine wait-for-started:', waitError);
      captureFeatureException(waitError, {
        feature: 'sandbox',
        pi: 'PI-05',
        operation: 'wait_for_started',
        ticketId,
        ticketType: context.ticket.ticket_type,
        level: 'warning',
        extras: { machineId: launched.machine.id },
      });
    }

    // Seed intentionally unhardened baseline files when the ticket defines them.
    if (Object.keys(preloadFiles).length > 0) {
      try {
        const source = buildPreloadPythonSource(preloadFiles, preloadModes);
        const result = await execSandboxMachine(
          launched.machine.id,
          pythonExecCommand(source),
          { timeoutSeconds: 45 }
        );
        if (result.exitCode !== 0) {
          console.warn('sandbox preload exec non-zero:', {
            exitCode: result.exitCode,
            stderr: result.stderr.slice(0, 300),
          });
          captureFeatureException(
            new Error(`sandbox preload failed (exit ${result.exitCode})`),
            {
              feature: 'sandbox',
              pi: 'PI-05',
              operation: 'preload_baseline',
              ticketId,
              ticketType: context.ticket.ticket_type,
              level: 'warning',
              extras: {
                machineId: launched.machine.id,
                stderrPreview: result.stderr.slice(0, 300),
              },
            }
          );
        }
      } catch (preloadError) {
        console.warn('sandbox preload failed:', preloadError);
        captureFeatureException(preloadError, {
          feature: 'sandbox',
          pi: 'PI-05',
          operation: 'preload_baseline',
          ticketId,
          ticketType: context.ticket.ticket_type,
          level: 'warning',
          extras: { machineId: launched.machine.id },
        });
      }
    }
  } catch (error) {
    console.error('Fly sandbox launch failed:', error);
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'launch_machine',
      ticketId,
      ticketType: context.ticket.ticket_type,
    });
    const message =
      error instanceof Error && error.message.includes('not configured')
        ? error.message
        : 'Failed to launch sandbox machine';
    const status =
      error instanceof Error && error.message.includes('not configured')
        ? 503
        : 502;
    return NextResponse.json({ error: message }, { status });
  }

  const startedAt = now;
  const expiresAt = new Date(startedAt.getTime() + idleTimeoutMinutes * 60_000);

  const { data: session, error: insertError } = await supabase
    .from('sandbox_sessions')
    .insert({
      ticket_id: ticketId,
      student_id: context.appUser.id,
      tenant_id: context.appUser.tenant_id,
      machine_id: launched.machine.id,
      machine_name: launched.machine.name,
      region: launched.region,
      status: 'running',
      started_at: startedAt.toISOString(),
      idle_timeout_minutes: idleTimeoutMinutes,
      expires_at: expiresAt.toISOString(),
    })
    .select(
      'id, ticket_id, student_id, machine_id, machine_name, region, status, started_at, stopped_at, duration_seconds, idle_timeout_minutes, expires_at, stop_reason'
    )
    .single();

  if (insertError || !session) {
    console.error('sandbox_sessions insert failed:', insertError);
    captureFeatureException(
      insertError ?? new Error('sandbox_sessions insert returned no row'),
      {
        feature: 'sandbox',
        pi: 'PI-05',
        operation: 'insert_session',
        ticketId,
        ticketType: context.ticket.ticket_type,
        extras: { machineId: launched.machine.id },
      }
    );
    try {
      await destroySandboxMachine(launched.machine.id);
    } catch (destroyError) {
      console.error(
        'Failed to destroy orphan sandbox after insert error:',
        destroyError
      );
      captureFeatureException(destroyError, {
        feature: 'sandbox',
        pi: 'PI-05',
        operation: 'destroy_orphan_machine',
        ticketId,
        ticketType: context.ticket.ticket_type,
        extras: { machineId: launched.machine.id },
      });
    }
    return NextResponse.json(
      { error: 'Failed to record sandbox session' },
      { status: 500 }
    );
  }

  console.info(
    JSON.stringify({
      event: 'sandbox_session_start',
      sessionId: session.id,
      ticketId,
      studentId: context.appUser.id,
      machineId: launched.machine.id,
      region: launched.region,
      idleTimeoutMinutes,
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
  );

  return NextResponse.json(
    sessionResponse(session as SandboxSessionRow, launched.appName, {
      reused: false,
    }),
    { status: 201 }
  );
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const eligibility = assertSandboxEligible(context.ticket);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.reason }, { status: 403 });
  }

  let existing: SandboxSessionRow | null;
  try {
    existing = await loadRunningSession(supabase, context.appUser.id, ticketId);
  } catch (error) {
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'load_session_delete',
      ticketId,
      ticketType: context.ticket.ticket_type,
    });
    return NextResponse.json(
      { error: 'Failed to load sandbox session' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      { error: 'No running sandbox session for this ticket' },
      { status: 404 }
    );
  }

  const now = new Date();
  const reason: StopReason =
    new Date(existing.expires_at).getTime() <= now.getTime()
      ? 'idle_timeout'
      : 'user_stop';

  try {
    const closed = await closeSession(supabase, existing, reason);
    return NextResponse.json(
      {
        success: true,
        sessionId: closed.id,
        machineId: closed.machine_id,
        status: closed.status,
        startedAt: closed.started_at,
        stoppedAt: closed.stopped_at,
        durationSeconds: closed.duration_seconds,
        stopReason: closed.stop_reason,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('sandbox stop failed:', error);
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'stop_session',
      ticketId,
      ticketType: context.ticket.ticket_type,
      extras: { sessionId: existing.id, stopReason: reason },
    });
    return NextResponse.json(
      { error: 'Failed to stop sandbox' },
      { status: 500 }
    );
  }
}

/** GET returns the current running session + websocket URL (if any). */
export async function GET(_request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const eligibility = assertSandboxEligible(context.ticket);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.reason }, { status: 403 });
  }

  let existing: SandboxSessionRow | null;
  try {
    existing = await loadRunningSession(supabase, context.appUser.id, ticketId);
  } catch (error) {
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'load_session_get',
      ticketId,
      ticketType: context.ticket.ticket_type,
    });
    return NextResponse.json(
      { error: 'Failed to load sandbox session' },
      { status: 500 }
    );
  }

  if (!existing) {
    return NextResponse.json({ session: null }, { status: 200 });
  }

  const now = new Date();
  if (new Date(existing.expires_at).getTime() <= now.getTime()) {
    try {
      const closed = await closeSession(supabase, existing, 'idle_timeout');
      return NextResponse.json(
        {
          session: null,
          expired: {
            sessionId: closed.id,
            durationSeconds: closed.duration_seconds,
            stopReason: closed.stop_reason,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error('sandbox idle expiry on GET failed:', error);
      captureFeatureException(error, {
        feature: 'sandbox',
        pi: 'PI-05',
        operation: 'expire_idle_session_get',
        ticketId,
        ticketType: context.ticket.ticket_type,
        extras: { sessionId: existing.id },
      });
      return NextResponse.json(
        { error: 'Failed to expire sandbox session' },
        { status: 500 }
      );
    }
  }

  const appName = process.env.FLY_APP_NAME?.trim();
  if (!appName) {
    return NextResponse.json(
      { error: 'FLY_APP_NAME is not configured' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { session: sessionResponse(existing, appName) },
    { status: 200 }
  );
}
