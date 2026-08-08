import { NextResponse } from 'next/server';

import { isAoReviewTicketType } from '@/lib/capstone/ticketCodes';
import { isFlagshipEligibleTicketType } from '@/lib/helpdesk/ticketCodes';
import { captureFeatureException } from '@/lib/observability/sentry';
import { persistPoamItems } from '@/lib/poam/persistPoamItems';
import {
  resolveTicketScorer,
  scoreStatusToProgressStatus,
  type TicketSubmission,
} from '@/lib/scoring';
import { isPoamTicketType } from '@/lib/scoring/poam';
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Preserve AO questions generated on first load when the client omits them. */
function mergeAoReviewSubmission(
  submission: TicketSubmission,
  existingSubmission: Record<string, unknown> | null | undefined
): TicketSubmission {
  if (!isPlainObject(existingSubmission)) {
    return submission;
  }

  const existingQuestions = existingSubmission.questions;
  const incomingQuestions = submission.questions;
  const questions =
    Array.isArray(incomingQuestions) && incomingQuestions.length > 0
      ? incomingQuestions
      : existingQuestions;

  return {
    ...existingSubmission,
    ...submission,
    questions,
    answers: isPlainObject(submission.answers)
      ? submission.answers
      : existingSubmission.answers,
  };
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

  const parsedSubmission = parseSubmission(body);
  if (!parsedSubmission) {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 }
    );
  }

  const existingProgress = await loadTicketProgress(context, ticketId);

  const submission = isAoReviewTicketType(context.ticket.ticket_type)
    ? mergeAoReviewSubmission(
        parsedSubmission,
        (existingProgress?.submission as Record<string, unknown> | null) ?? null
      )
    : parsedSubmission;

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

  const flagshipEligible = isFlagshipEligibleTicketType(
    context.ticket.ticket_type
  );
  const markFlagship = flagshipEligible && scoreResult.status === 'resolved';

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
        // Clear flagship on flagship-eligible upsert; promote again below when resolved.
        // Omitted for other ticket types so unrelated submits leave flagship alone.
        ...(flagshipEligible ? { is_flagship: false } : {}),
      },
      { onConflict: 'student_id,ticket_id' }
    )
    .select(
      'id, item_kind, title, score_status, structured_result, narrative, ticket_type, tier, is_flagship, created_at, updated_at'
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

  let isFlagship = Boolean(portfolioItem.is_flagship);
  if (markFlagship) {
    // Clear any prior flagship on this track, then promote this capstone item
    // (GRC AO review or helpdesk HD-07 / PI-07).
    const { error: clearError } = await context.supabase
      .from('portfolio_items')
      .update({ is_flagship: false, updated_at: now })
      .eq('student_id', context.appUser.id)
      .eq('track_id', context.ticket.track_id)
      .eq('is_flagship', true)
      .neq('id', portfolioItem.id);

    if (clearError) {
      console.error('clear prior flagship failed:', clearError);
      captureFeatureException(clearError, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'clear_prior_flagship',
        ticketId,
        ticketType: context.ticket.ticket_type,
      });
    }

    const { data: flagged, error: flagError } = await context.supabase
      .from('portfolio_items')
      .update({
        is_flagship: true,
        is_public: true,
        updated_at: now,
      })
      .eq('id', portfolioItem.id)
      .select('id, is_flagship')
      .single();

    if (flagError) {
      console.error('set flagship failed:', flagError);
      captureFeatureException(flagError, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'set_flagship_portfolio_item',
        ticketId,
        ticketType: context.ticket.ticket_type,
      });
    } else {
      isFlagship = Boolean(flagged?.is_flagship);
    }
  }

  let poamItemsUpserted: number | null = null;
  if (
    isPoamTicketType(context.ticket.ticket_type) &&
    scoreResult.status === 'resolved'
  ) {
    try {
      const persisted = await persistPoamItems({
        supabase: context.supabase,
        tenantId: context.appUser.tenant_id,
        studentId: context.appUser.id,
        trackId: context.ticket.track_id,
        ticketId,
        submission,
      });
      poamItemsUpserted = persisted.upserted;
    } catch (error) {
      console.error('POA&M persistence failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'persist_poam_items',
        ticketId,
        ticketType: context.ticket.ticket_type,
      });
      return NextResponse.json(
        { error: 'Scored successfully but failed to save POA&M items' },
        { status: 500 }
      );
    }
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
      isFlagship,
      poamItemsUpserted,
      slaWithin: withinSla,
      slaOverdue: withinSla === null ? null : !withinSla,
    },
    { status: 201 }
  );
}
