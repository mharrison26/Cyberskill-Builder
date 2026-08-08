import { NextResponse } from 'next/server';

import { captureFeatureException } from '@/lib/observability/sentry';
import { assertSandboxEligible } from '@/lib/sandbox/eligibility';
import { execSandboxMachine } from '@/lib/sandbox/flyMachines';
import {
  buildSnapshotPythonSource,
  collectSnapshotPaths,
  parseGuestSnapshotJson,
  pythonExecCommand,
} from '@/lib/sandbox/guestState';
import { createClient } from '@/lib/supabase/server';
import { resolveSubmitTicketContext } from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

/**
 * POST /api/tickets/[ticketId]/sandbox/snapshot
 *
 * Capture guest filesystem paths needed by expected_state config-diff rules
 * from the student's running Fly sandbox. Client submits the returned
 * `{ files, fileModes }` to /submit for PI-06 scoring.
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

  const { data: session, error: sessionError } = await supabase
    .from('sandbox_sessions')
    .select('id, machine_id, status, expires_at')
    .eq('student_id', context.appUser.id)
    .eq('ticket_id', ticketId)
    .eq('status', 'running')
    .maybeSingle();

  if (sessionError) {
    captureFeatureException(sessionError, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'snapshot_load_session',
      ticketId,
      ticketType: context.ticket.ticket_type,
    });
    return NextResponse.json(
      { error: 'Failed to load sandbox session' },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: 'No running sandbox session for this ticket' },
      { status: 404 }
    );
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Sandbox session has expired; launch a new sandbox' },
      { status: 410 }
    );
  }

  const initialState = (context.ticket.initial_state ?? {}) as Record<
    string,
    unknown
  >;
  const expectedState = (context.ticket.expected_state ?? {}) as Record<
    string,
    unknown
  >;
  const paths = collectSnapshotPaths({ initialState, expectedState });

  if (paths.length === 0) {
    return NextResponse.json(
      { error: 'Ticket has no snapshot paths (rules / preload files)' },
      { status: 400 }
    );
  }

  try {
    const source = buildSnapshotPythonSource(paths);
    const result = await execSandboxMachine(
      session.machine_id,
      pythonExecCommand(source),
      { timeoutSeconds: 45 }
    );

    if (result.exitCode !== 0) {
      captureFeatureException(
        new Error(`sandbox snapshot failed (exit ${result.exitCode})`),
        {
          feature: 'sandbox',
          pi: 'PI-05',
          operation: 'snapshot_exec',
          ticketId,
          ticketType: context.ticket.ticket_type,
          extras: {
            machineId: session.machine_id,
            stderrPreview: result.stderr.slice(0, 300),
          },
        }
      );
      return NextResponse.json(
        {
          error: 'Failed to capture sandbox filesystem state',
          detail: result.stderr.slice(0, 200) || undefined,
        },
        { status: 502 }
      );
    }

    const snapshot = parseGuestSnapshotJson(result.stdout);
    if (!snapshot) {
      return NextResponse.json(
        { error: 'Sandbox snapshot response was not valid JSON' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        sessionId: session.id,
        machineId: session.machine_id,
        files: snapshot.files,
        fileModes: snapshot.fileModes,
        paths,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('sandbox snapshot failed:', error);
    captureFeatureException(error, {
      feature: 'sandbox',
      pi: 'PI-05',
      operation: 'snapshot_exec',
      ticketId,
      ticketType: context.ticket.ticket_type,
      extras: { machineId: session.machine_id },
    });
    return NextResponse.json(
      { error: 'Failed to capture sandbox filesystem state' },
      { status: 502 }
    );
  }
}
