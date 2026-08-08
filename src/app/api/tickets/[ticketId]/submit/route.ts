import { NextResponse } from 'next/server';

import { captureFeatureException } from '@/lib/observability/sentry';
import {
  resolveTicketScorer,
  scoreStatusToProgressStatus,
  type TicketSubmission,
} from '@/lib/scoring';
import { createClient } from '@/lib/supabase/server';
import { wasResolvedWithinSla } from '@/lib/tickets/sla';
import {
  loadTicketProgress,
  resolveSubmitTicketContext,
} from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

function parseSubmission(body: unknown): TicketSubmission | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as TicketSubmission;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const submission = parseSubmission(body);
  if (!submission) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 }
    );
  }

  const scorer = resolveTicketScorer(context.ticket.ticket_type);

  let scoreResult;
  try {
    scoreResult = await scorer.score(submission, context.ticket);
  } catch (error) {
    console.error('Ticket scoring failed:', error);
    captureFeatureException(error, {
      feature: 'scoring',
      pi: 'PI-03',
      operation: 'score_submission',
      ticketId,
      ticketType: context.ticket.ticket_type,
      // Never attach submission / file contents
      extras: { submissionKeys: Object.keys(submission) },
    });
    return NextResponse.json(
      { error: 'Failed to score submission' },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const progressStatus = scoreStatusToProgressStatus(scoreResult.status);
  const existingProgress = await loadTicketProgress(context, ticketId);
  const startedAt = existingProgress?.started_at ?? now;

  const { data: progress, error: progressError } = await context.supabase
    .from('ticket_progress')
    .upsert(
      {
        student_id: context.appUser.id,
        ticket_id: ticketId,
        status: progressStatus,
        started_at: startedAt,
        resolved_at: progressStatus === 'resolved' ? now : null,
        submission,
      },
      { onConflict: 'student_id,ticket_id' }
    )
    .select('id, status, started_at, resolved_at')
    .single();

  if (progressError || !progress) {
    console.error('ticket_progress upsert failed:', progressError);
    captureFeatureException(
      progressError ?? new Error('ticket_progress upsert returned no row'),
      {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'upsert_ticket_progress',
        ticketId,
        ticketType: context.ticket.ticket_type,
        extras: { progressStatus },
      }
    );
    return NextResponse.json(
      { error: 'Failed to update ticket progress' },
      { status: 500 }
    );
  }

  const title =
    context.ticket.scenario_brief.trim().slice(0, 200) ||
    `Ticket ${ticketId.slice(0, 8)}`;

  const { data: portfolioItem, error: portfolioError } = await context.supabase
    .from('portfolio_items')
    .upsert(
      {
        tenant_id: context.appUser.tenant_id,
        student_id: context.appUser.id,
        track_id: context.ticket.track_id,
        tier: String(context.ticket.tier),
        item_kind: 'ticket_resolution',
        title,
        dcwf_code: context.ticket.dcwf_code,
        structured_result: scoreResult.structuredResult,
        narrative: scoreResult.feedback,
        ticket_id: ticketId,
        ticket_type: context.ticket.ticket_type,
        score_status: scoreResult.status,
        submission,
        updated_at: now,
      },
      { onConflict: 'student_id,ticket_id' }
    )
    .select(
      'id, item_kind, title, score_status, structured_result, narrative, ticket_type, tier, created_at, updated_at'
    )
    .single();

  if (portfolioError || !portfolioItem) {
    console.error('portfolio_items upsert failed:', portfolioError);
    captureFeatureException(
      portfolioError ?? new Error('portfolio_items upsert returned no row'),
      {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'upsert_portfolio_item',
        ticketId,
        ticketType: context.ticket.ticket_type,
        extras: { scoreStatus: scoreResult.status },
      }
    );
    return NextResponse.json(
      { error: 'Failed to save portfolio item' },
      { status: 500 }
    );
  }

  // Reported only — overdue never blocks submission.
  const withinSla =
    progressStatus === 'resolved'
      ? wasResolvedWithinSla(
          progress.started_at,
          progress.resolved_at,
          context.ticket.sla_minutes
        )
      : null;

  return NextResponse.json(
    {
      success: true,
      status: scoreResult.status,
      feedback: scoreResult.feedback,
      structuredResult: scoreResult.structuredResult,
      progressId: progress.id,
      progressStatus: progress.status,
      portfolioItemId: portfolioItem.id,
      slaWithin: withinSla,
      slaOverdue: withinSla === null ? null : !withinSla,
    },
    { status: 201 }
  );
}
