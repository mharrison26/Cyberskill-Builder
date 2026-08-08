import { NextResponse } from 'next/server';

import {
  generateInfraFollowUpQuestionsFromDesignDoc,
  type InfraFollowUpQuestion,
} from '@/lib/infra/generateFollowUpQuestions';
import { isInfraDesignCapstoneTicketType } from '@/lib/infra/ticketCodes';
import {
  INFRA_DESIGN_DOC_MIN_BODY_LENGTH,
  INFRA_DESIGN_DOC_MIN_TITLE_LENGTH,
} from '@/lib/scoring/ticketUi';
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

function parseDesignDoc(body: unknown): {
  title: string;
  body: string;
  topologyChoice?: string;
} | null {
  if (!isPlainObject(body)) return null;

  const nested = body.designDoc;
  const source = isPlainObject(nested) ? nested : body;

  const title = typeof source.title === 'string' ? source.title.trim() : '';
  const designBody =
    typeof source.body === 'string'
      ? source.body.trim()
      : typeof source.designBody === 'string'
        ? source.designBody.trim()
        : '';
  const topologyChoice =
    typeof source.topologyChoice === 'string' && source.topologyChoice.trim()
      ? source.topologyChoice.trim()
      : typeof source.topology_choice === 'string' &&
          source.topology_choice.trim()
        ? source.topology_choice.trim()
        : undefined;

  if (!title && !designBody) return null;
  return { title, body: designBody, topologyChoice };
}

function extractStored(
  submission: Record<string, unknown> | null | undefined
): {
  designDoc: {
    title: string;
    body: string;
    topologyChoice?: string;
  } | null;
  questions: InfraFollowUpQuestion[];
  generatedAt?: string;
  source?: string;
} | null {
  if (!isPlainObject(submission)) return null;

  const designDoc = parseDesignDoc(submission);
  const raw = submission.questions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return designDoc
      ? { designDoc, questions: [] }
      : null;
  }

  const questions: InfraFollowUpQuestion[] = [];
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

  return {
    designDoc,
    questions,
    generatedAt:
      typeof submission.questionsGeneratedAt === 'string'
        ? submission.questionsGeneratedAt
        : undefined,
    source:
      typeof submission.questionsSource === 'string'
        ? submission.questionsSource
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
 * GET: return stored design doc + questions if present.
 * POST: generate (once) follow-up questions from the submitted design doc.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const supabase = await createClient();
  const resolved = await resolveSubmitTicketContext(supabase, params.ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  if (!isInfraDesignCapstoneTicketType(context.ticket.ticket_type)) {
    return NextResponse.json(
      {
        error:
          'Infra follow-up questions are only available for infra_design_capstone tickets',
      },
      { status: 400 }
    );
  }

  const existing = await loadTicketProgress(context, params.ticketId);
  const stored = extractStored(
    (existing?.submission as Record<string, unknown> | null | undefined) ?? null
  );

  if (stored?.questions.length) {
    return NextResponse.json({
      phase: 'questions',
      designDoc: stored.designDoc,
      questions: stored.questions,
      generatedAt: stored.generatedAt ?? null,
      source: stored.source ?? 'stored',
      cached: true,
    });
  }

  return NextResponse.json({
    phase: 'design',
    designDoc: stored?.designDoc ?? null,
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
  if (!isInfraDesignCapstoneTicketType(context.ticket.ticket_type)) {
    return NextResponse.json(
      {
        error:
          'Infra follow-up questions are only available for infra_design_capstone tickets',
      },
      { status: 400 }
    );
  }

  const existing = await loadTicketProgress(context, params.ticketId);
  const stored = extractStored(
    (existing?.submission as Record<string, unknown> | null | undefined) ?? null
  );

  if (stored?.questions.length) {
    return NextResponse.json({
      phase: 'questions',
      designDoc: stored.designDoc,
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

  const designDoc = parseDesignDoc(body);
  if (!designDoc) {
    return NextResponse.json(
      { error: 'Request body must include designDoc with title and body' },
      { status: 400 }
    );
  }

  const minBodyLength = minFromExpected(
    context.ticket.expected_state,
    'minBodyLength',
    INFRA_DESIGN_DOC_MIN_BODY_LENGTH
  );
  const minTitleLength = minFromExpected(
    context.ticket.expected_state,
    'minTitleLength',
    INFRA_DESIGN_DOC_MIN_TITLE_LENGTH
  );

  if (designDoc.title.length < minTitleLength) {
    return NextResponse.json(
      {
        error: `Design document title must be at least ${minTitleLength} characters`,
      },
      { status: 400 }
    );
  }
  if (designDoc.body.length < minBodyLength) {
    return NextResponse.json(
      {
        error: `Design document body must be at least ${minBodyLength} characters`,
      },
      { status: 400 }
    );
  }

  try {
    const generated = await generateInfraFollowUpQuestionsFromDesignDoc(
      designDoc
    );
    const now = new Date().toISOString();
    const startedAt = existing?.started_at ?? now;

    const priorAnswers = isPlainObject(
      (existing?.submission as Record<string, unknown> | null)?.answers
    )
      ? ((existing?.submission as Record<string, unknown>).answers as Record<
          string,
          unknown
        >)
      : {};

    const submission = {
      type: 'infra_design_capstone',
      designDoc,
      questions: generated.questions,
      questionsGeneratedAt: generated.generatedAt,
      questionsSource: generated.source,
      retrievedDesignSectionIds: generated.retrievedDesignSectionIds,
      retrievedRubricSectionIds: generated.retrievedRubricSectionIds,
      answers: priorAnswers,
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
      console.error('infra-questions progress upsert failed:', progressError);
      return NextResponse.json(
        { error: 'Failed to store generated follow-up questions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      phase: 'questions',
      designDoc,
      questions: generated.questions,
      generatedAt: generated.generatedAt,
      source: generated.source,
      cached: false,
    });
  } catch (error) {
    console.error('infra-questions generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate follow-up questions' },
      { status: 500 }
    );
  }
}
