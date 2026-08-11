import { NextResponse } from 'next/server';

import { isAoReviewTicketType } from '@/lib/capstone/ticketCodes';
import {
  buildConmonSystemProfileGapsMessage,
  compileConmonSystemProfile,
  usesStudentConmonSystemProfile,
} from '@/lib/grc/compileConmonSystemProfile';
import {
  buildPoamSourceGapsMessage,
  compilePoamSourceFindings,
  toPriorFindingsSeedShape,
  usesStudentPoamSourceFindings,
} from '@/lib/grc/compilePoamSourceFindings';
import { isAuditCommitteeBriefTicketType } from '@/lib/grc/ticketCodes';
import { isFlagshipEligibleTicketType } from '@/lib/helpdesk/ticketCodes';
import { isInfraDesignCapstoneTicketType } from '@/lib/infra/ticketCodes';
import {
  captureScenarioGraded,
  captureScenarioSubmitted,
} from '@/lib/analytics/capture';
import {
  durationSeconds,
  scenarioPropsFromTicket,
} from '@/lib/analytics/events';
import { captureFeatureException } from '@/lib/observability/sentry';
import { persistPoamItems } from '@/lib/poam/persistPoamItems';
import { enrichTrainingFeedback } from '@/lib/feedback';
import {
  resolveTicketScorer,
  scoreStatusToProgressStatus,
  type TicketSubmission,
} from '@/lib/scoring';
import { isConMonStrategyTicketType } from '@/lib/scoring/conmonStrategy';
import { isPoamTicketType } from '@/lib/scoring/poam';
import { createClient } from '@/lib/supabase/server';
import {
  canStartNewAttempt,
  nextAttemptNumber,
  resolveMaxAttempts,
} from '@/lib/tickets/attempts';
import { computeSlaDueAt, wasResolvedWithinSla } from '@/lib/tickets/sla';
import {
  loadTicketProgress,
  resolveSubmitTicketContext,
} from '@/lib/tickets/submitTicketContext';
import type { Ticket } from '@/types';

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

/** Preserve generated design doc + follow-up questions when the client omits them. */
function mergeInfraDesignCapstoneSubmission(
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

  const incomingDesign = submission.designDoc;
  const designDoc =
    isPlainObject(incomingDesign) &&
    (typeof incomingDesign.title === 'string' ||
      typeof incomingDesign.body === 'string')
      ? incomingDesign
      : existingSubmission.designDoc;

  return {
    ...existingSubmission,
    ...submission,
    designDoc,
    questions,
    answers: isPlainObject(submission.answers)
      ? submission.answers
      : existingSubmission.answers,
  };
}

/** Preserve generated AC questions + prior-findings narrative when the client omits them. */
function mergeAuditCommitteeBriefSubmission(
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

  const incomingSummary =
    typeof submission.executiveSummary === 'string' &&
    submission.executiveSummary.trim()
      ? submission.executiveSummary
      : typeof submission.summary === 'string' && submission.summary.trim()
        ? submission.summary
        : existingSubmission.executiveSummary;

  return {
    ...existingSubmission,
    ...submission,
    executiveSummary: incomingSummary,
    questions,
    priorFindingsNarrative:
      typeof submission.priorFindingsNarrative === 'string' &&
      submission.priorFindingsNarrative.trim()
        ? submission.priorFindingsNarrative
        : existingSubmission.priorFindingsNarrative,
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

  // Require an explicit Open ticket (SLA start) before graded submit.
  if (!existingProgress?.started_at || existingProgress.status === 'new') {
    return NextResponse.json(
      {
        error:
          'Open the ticket before submitting. The SLA timer starts when you open the ticket.',
      },
      { status: 409 }
    );
  }

  if (
    existingProgress.status === 'resolved' ||
    existingProgress.status === 'reviewed'
  ) {
    return NextResponse.json(
      {
        error:
          'This scenario is resolved. Use Retry scenario to start a new graded attempt.',
      },
      { status: 409 }
    );
  }

  const maxAttempts = resolveMaxAttempts(context.ticket.max_attempts);
  const priorAttemptCount = existingProgress.attempt_count ?? 0;
  if (
    !canStartNewAttempt({
      attemptCount: priorAttemptCount,
      maxAttempts,
    })
  ) {
    return NextResponse.json(
      { error: `Maximum attempts reached (${maxAttempts}).` },
      { status: 409 }
    );
  }

  const existingSubmission =
    (existingProgress?.submission as Record<string, unknown> | null) ?? null;

  const submission = isAoReviewTicketType(context.ticket.ticket_type)
    ? mergeAoReviewSubmission(parsedSubmission, existingSubmission)
    : isInfraDesignCapstoneTicketType(context.ticket.ticket_type)
      ? mergeInfraDesignCapstoneSubmission(parsedSubmission, existingSubmission)
      : isAuditCommitteeBriefTicketType(context.ticket.ticket_type)
        ? mergeAuditCommitteeBriefSubmission(
            parsedSubmission,
            existingSubmission
          )
        : parsedSubmission;

  let ticketForScoring: Ticket = context.ticket;
  const ticketInitialState = isPlainObject(context.ticket.initial_state)
    ? context.ticket.initial_state
    : {};

  if (
    isPoamTicketType(context.ticket.ticket_type) &&
    usesStudentPoamSourceFindings(ticketInitialState)
  ) {
    const compiled = await compilePoamSourceFindings({
      supabase: context.supabase,
      studentId: context.appUser.id,
      trackId: context.ticket.track_id,
      initialState: ticketInitialState,
    });

    if (!compiled.complete || compiled.findings.length < 2) {
      return NextResponse.json(
        {
          error: buildPoamSourceGapsMessage(compiled.gaps),
          gaps: compiled.gaps,
        },
        { status: 400 }
      );
    }

    ticketForScoring = {
      ...context.ticket,
      initial_state: {
        ...ticketInitialState,
        prior_findings: toPriorFindingsSeedShape(compiled.findings),
      },
    };
  }

  if (
    isConMonStrategyTicketType(context.ticket.ticket_type) &&
    usesStudentConmonSystemProfile(ticketInitialState)
  ) {
    const compiled = await compileConmonSystemProfile({
      supabase: context.supabase,
      studentId: context.appUser.id,
      trackId: context.ticket.track_id,
      initialState: ticketInitialState,
    });

    if (!compiled.complete || !compiled.systemProfile) {
      return NextResponse.json(
        {
          error: buildConmonSystemProfileGapsMessage(compiled.gaps),
          gaps: compiled.gaps,
        },
        { status: 400 }
      );
    }

    ticketForScoring = {
      ...context.ticket,
      initial_state: {
        ...ticketInitialState,
        systemProfile: compiled.systemProfile,
        systemProfileSource: compiled.source,
      },
    };
  }

  const scorer = resolveTicketScorer(context.ticket.ticket_type);

  let scoreResult;
  try {
    scoreResult = await scorer.score(submission, ticketForScoring);
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
  const startedAt = existingProgress.started_at;
  const slaDueAt =
    existingProgress.sla_due_at ??
    computeSlaDueAt(startedAt, context.ticket.sla_minutes);
  const resolvedAt = progressStatus === 'resolved' ? now : null;
  const slaMet =
    progressStatus === 'resolved'
      ? wasResolvedWithinSla(startedAt, resolvedAt, context.ticket.sla_minutes)
      : null;
  const attemptNumber = nextAttemptNumber(priorAttemptCount);

  const { data: peerRows } = await context.supabase
    .from('portfolio_items')
    .select('structured_result')
    .eq('ticket_id', ticketId)
    .neq('student_id', context.appUser.id)
    .limit(200);

  const enriched = enrichTrainingFeedback({
    structuredResult: scoreResult.structuredResult,
    slaMinutes: context.ticket.sla_minutes,
    startedAt,
    resolvedAt: resolvedAt ?? now,
    peerStructuredResults: (peerRows ?? []).map(
      (row) => row.structured_result as Record<string, unknown> | null
    ),
  });

  scoreResult = {
    ...scoreResult,
    structuredResult: {
      ...enriched.structuredResult,
      sla: {
        startedAt,
        dueAt: slaDueAt,
        resolvedAt,
        met: slaMet,
        withinSla: slaMet,
        minutesAllowed: context.ticket.sla_minutes,
      },
    },
  };

  const { data: progress, error: progressError } = await context.supabase
    .from('ticket_progress')
    .upsert(
      {
        student_id: context.appUser.id,
        ticket_id: ticketId,
        status: progressStatus,
        started_at: startedAt,
        sla_due_at: slaDueAt,
        resolved_at: resolvedAt,
        sla_met: slaMet,
        submission,
        last_score_status: scoreResult.status,
        last_feedback: scoreResult.feedback,
        last_structured_result: scoreResult.structuredResult,
        attempt_count: attemptNumber,
      },
      { onConflict: 'student_id,ticket_id' }
    )
    .select(
      'id, status, started_at, resolved_at, sla_due_at, sla_met, attempt_count, submission, last_score_status, last_feedback, last_structured_result'
    )
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

  const { error: attemptError } = await context.supabase
    .from('ticket_attempts')
    .insert({
      student_id: context.appUser.id,
      ticket_id: ticketId,
      attempt_number: attemptNumber,
      submitted_at: now,
      score_status: scoreResult.status,
      feedback: scoreResult.feedback,
      submission,
      structured_result: scoreResult.structuredResult,
      sla_started_at: startedAt,
      sla_due_at: slaDueAt,
      sla_resolved_at: resolvedAt ?? now,
      sla_met: slaMet,
    });

  if (attemptError) {
    console.error('ticket_attempts insert failed:', attemptError);
    captureFeatureException(attemptError, {
      feature: 'scoring',
      pi: 'PI-03',
      operation: 'insert_ticket_attempt',
      ticketId,
      ticketType: context.ticket.ticket_type,
      extras: { attemptNumber },
    });
    return NextResponse.json(
      { error: 'Scored successfully but failed to record attempt history' },
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
    // (GRC AO review, helpdesk HD-07, or sysadmin SA-07 / PI-07).
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
  const withinSla = slaMet;

  const structured = scoreResult.structuredResult as
    Record<string, unknown> | null | undefined;
  const rawScore = structured?.score;
  const scorePercent =
    typeof rawScore === 'number'
      ? rawScore
      : scoreResult.status === 'resolved'
        ? 100
        : null;

  const { count: priorGraded } = await context.supabase
    .from('ticket_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', context.appUser.id)
    .neq('ticket_id', ticketId);

  const scenarioProps = scenarioPropsFromTicket({
    id: ticketId,
    ticket_type: context.ticket.ticket_type,
    tier: context.ticket.tier,
    track_id: context.ticket.track_id,
    initial_state: context.ticket.initial_state,
    expected_state: context.ticket.expected_state,
  });
  const isFirstGraded = priorAttemptCount === 0 && (priorGraded ?? 0) === 0;

  void captureScenarioSubmitted(context.appUser.id, {
    ...scenarioProps,
    is_first: priorAttemptCount === 0,
  });
  void captureScenarioGraded(context.appUser.id, {
    ...scenarioProps,
    score: scorePercent,
    duration_seconds: durationSeconds(startedAt, resolvedAt ?? now),
    sla_met: slaMet,
    score_status: scoreResult.status,
    is_first_graded: isFirstGraded,
  });

  const { data: attemptRows } = await context.supabase
    .from('ticket_attempts')
    .select(
      'id, attempt_number, submitted_at, score_status, feedback, submission, structured_result, sla_started_at, sla_due_at, sla_resolved_at, sla_met'
    )
    .eq('student_id', context.appUser.id)
    .eq('ticket_id', ticketId)
    .order('attempt_number', { ascending: true });

  return NextResponse.json(
    {
      success: true,
      status: scoreResult.status,
      feedback: scoreResult.feedback,
      structuredResult: scoreResult.structuredResult,
      trainingFeedback: enriched.trainingFeedback,
      submission,
      progressId: progress.id,
      progressStatus: progress.status,
      startedAt: progress.started_at,
      slaStartedAt: progress.started_at,
      resolvedAt: progress.resolved_at,
      slaResolvedAt: progress.resolved_at,
      slaDueAt: progress.sla_due_at ?? slaDueAt,
      slaMet: progress.sla_met ?? slaMet,
      lastScoreStatus: progress.last_score_status ?? scoreResult.status,
      attemptCount: progress.attempt_count ?? attemptNumber,
      maxAttempts,
      attempts: attemptRows ?? [],
      portfolioItemId: portfolioItem.id,
      isFlagship,
      poamItemsUpserted,
      slaWithin: withinSla,
      slaOverdue: withinSla === null ? null : !withinSla,
    },
    { status: 201 }
  );
}
