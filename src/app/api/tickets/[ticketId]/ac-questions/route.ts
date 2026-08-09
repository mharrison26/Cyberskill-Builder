import { NextResponse } from 'next/server';

import { compilePriorAuditFindings } from '@/lib/grc/compilePriorFindings';
import {
  generateAuditCommitteeQuestionsFromSummary,
  type AuditCommitteeQuestion,
} from '@/lib/grc/generateAuditCommitteeQuestions';
import { isAuditCommitteeBriefTicketType } from '@/lib/grc/ticketCodes';
import { AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH } from '@/lib/scoring/ticketUi';
import { createClient } from '@/lib/supabase/server';
import {
  loadTicketProgress,
  resolveSubmitTicketContext,
} from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExecutiveSummary(body: unknown): string | null {
  if (!isPlainObject(body)) return null;
  const value =
    typeof body.executiveSummary === 'string'
      ? body.executiveSummary
      : typeof body.summary === 'string'
        ? body.summary
        : typeof body.body === 'string'
          ? body.body
          : '';
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractStored(
  submission: Record<string, unknown> | null | undefined
): {
  executiveSummary: string | null;
  questions: AuditCommitteeQuestion[];
  generatedAt?: string;
  source?: string;
  priorFindingsNarrative?: string;
} | null {
  if (!isPlainObject(submission)) return null;

  const executiveSummary =
    typeof submission.executiveSummary === 'string' &&
    submission.executiveSummary.trim()
      ? submission.executiveSummary.trim()
      : typeof submission.summary === 'string' && submission.summary.trim()
        ? submission.summary.trim()
        : null;

  const raw = submission.questions;
  const questions: AuditCommitteeQuestion[] = [];
  if (Array.isArray(raw)) {
    for (let index = 0; index < raw.length; index += 1) {
      const entry = raw[index];
      if (!isPlainObject(entry)) continue;
      const prompt =
        typeof entry.prompt === 'string'
          ? entry.prompt.trim()
          : typeof entry.question === 'string'
            ? entry.question.trim()
            : '';
      if (!prompt) continue;
      const id =
        typeof entry.id === 'string' && entry.id.trim()
          ? entry.id.trim()
          : `q${index + 1}`;
      const focus =
        typeof entry.focus === 'string' && entry.focus.trim()
          ? entry.focus.trim()
          : undefined;
      questions.push({ id, prompt, focus });
    }
  }

  if (!executiveSummary && questions.length === 0) return null;

  return {
    executiveSummary,
    questions,
    generatedAt:
      typeof submission.questionsGeneratedAt === 'string'
        ? submission.questionsGeneratedAt
        : undefined,
    source:
      typeof submission.questionsSource === 'string'
        ? submission.questionsSource
        : undefined,
    priorFindingsNarrative:
      typeof submission.priorFindingsNarrative === 'string'
        ? submission.priorFindingsNarrative
        : undefined,
  };
}

function minFromExpected(
  expected: Record<string, unknown> | null | undefined,
  key: string,
  fallback: number
): number {
  if (!isPlainObject(expected)) return fallback;
  const value = expected[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

/**
 * GET: return prior findings + stored summary/questions if present.
 * POST: generate (once) audit-committee questions from the executive summary.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient();
  const resolved = await resolveSubmitTicketContext(supabase, params.ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  if (!isAuditCommitteeBriefTicketType(context.ticket.ticket_type)) {
    return NextResponse.json(
      {
        error:
          'Audit-committee questions are only available for audit_committee_brief tickets',
      },
      { status: 400 }
    );
  }

  const prior = await compilePriorAuditFindings({
    supabase: context.supabase,
    studentId: context.appUser.id,
    trackId: context.ticket.track_id,
    initialState: isPlainObject(context.ticket.initial_state)
      ? context.ticket.initial_state
      : {},
  });

  const existing = await loadTicketProgress(context, params.ticketId);
  const stored = extractStored(
    (existing?.submission as Record<string, unknown> | null | undefined) ?? null
  );

  if (stored?.questions.length) {
    return NextResponse.json({
      phase: 'questions',
      executiveSummary: stored.executiveSummary,
      priorFindings: prior.findings,
      priorFindingsSource: prior.source,
      priorFindingsNarrative:
        stored.priorFindingsNarrative ?? prior.narrative,
      questions: stored.questions,
      generatedAt: stored.generatedAt ?? null,
      source: stored.source ?? 'stored',
      cached: true,
    });
  }

  return NextResponse.json({
    phase: 'summary',
    executiveSummary: stored?.executiveSummary ?? null,
    priorFindings: prior.findings,
    priorFindingsSource: prior.source,
    priorFindingsNarrative: prior.narrative,
    questions: [],
    cached: false,
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const supabase = await createClient();
  const resolved = await resolveSubmitTicketContext(supabase, params.ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  if (!isAuditCommitteeBriefTicketType(context.ticket.ticket_type)) {
    return NextResponse.json(
      {
        error:
          'Audit-committee questions are only available for audit_committee_brief tickets',
      },
      { status: 400 }
    );
  }

  const prior = await compilePriorAuditFindings({
    supabase: context.supabase,
    studentId: context.appUser.id,
    trackId: context.ticket.track_id,
    initialState: isPlainObject(context.ticket.initial_state)
      ? context.ticket.initial_state
      : {},
  });

  const existing = await loadTicketProgress(context, params.ticketId);
  const stored = extractStored(
    (existing?.submission as Record<string, unknown> | null | undefined) ?? null
  );

  if (stored?.questions.length) {
    return NextResponse.json({
      phase: 'questions',
      executiveSummary: stored.executiveSummary,
      priorFindings: prior.findings,
      priorFindingsSource: prior.source,
      priorFindingsNarrative:
        stored.priorFindingsNarrative ?? prior.narrative,
      questions: stored.questions,
      generatedAt: stored.generatedAt ?? null,
      source: stored.source ?? 'stored',
      cached: true,
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const executiveSummary = parseExecutiveSummary(body);
  if (!executiveSummary) {
    return NextResponse.json(
      { error: 'Request body must include executiveSummary' },
      { status: 400 }
    );
  }

  const minSummaryLength = minFromExpected(
    context.ticket.expected_state,
    'minSummaryLength',
    AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH
  );

  if (executiveSummary.length < minSummaryLength) {
    return NextResponse.json(
      {
        error: `Executive summary must be at least ${minSummaryLength} characters`,
      },
      { status: 400 }
    );
  }

  try {
    const generated = await generateAuditCommitteeQuestionsFromSummary(
      { body: executiveSummary },
      { priorFindingsNarrative: prior.narrative }
    );
    const now = new Date().toISOString();
    const startedAt = existing?.started_at ?? now;

    const submission = {
      type: 'audit_committee_brief',
      executiveSummary,
      questions: generated.questions,
      questionsGeneratedAt: generated.generatedAt,
      questionsSource: generated.source,
      retrievedSummarySectionIds: generated.retrievedSummarySectionIds,
      retrievedGuidanceSectionIds: generated.retrievedGuidanceSectionIds,
      priorFindingsNarrative: prior.narrative,
      priorFindingsSource: prior.source,
    };

    const { error: progressError } = await context.supabase
      .from('ticket_progress')
      .upsert(
        {
          student_id: context.appUser.id,
          ticket_id: params.ticketId,
          status: existing?.status === 'resolved' ? 'resolved' : 'in_progress',
          started_at: startedAt,
          resolved_at: existing?.resolved_at ?? null,
          submission,
        },
        { onConflict: 'student_id,ticket_id' }
      );

    if (progressError) {
      console.error('ac-questions progress upsert failed:', progressError);
      return NextResponse.json(
        { error: 'Failed to store generated audit-committee questions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      phase: 'questions',
      executiveSummary,
      priorFindings: prior.findings,
      priorFindingsSource: prior.source,
      priorFindingsNarrative: prior.narrative,
      questions: generated.questions,
      generatedAt: generated.generatedAt,
      source: generated.source,
      cached: false,
    });
  } catch (error) {
    console.error('ac-questions generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate audit-committee questions' },
      { status: 500 }
    );
  }
}
