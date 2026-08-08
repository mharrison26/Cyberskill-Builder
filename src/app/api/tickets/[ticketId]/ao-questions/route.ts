import { NextResponse } from 'next/server';

import { compileStudentPackage } from '@/lib/capstone/compilePackage';
import {
  generateAoQuestionsFromPackage,
  type AoQuestion,
} from '@/lib/capstone/generateAoQuestions';
import { isAoReviewTicketType } from '@/lib/capstone/ticketCodes';
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

function extractStoredQuestions(
  submission: Record<string, unknown> | null | undefined
): {
  questions: AoQuestion[];
  generatedAt?: string;
  source?: string;
} | null {
  if (!isPlainObject(submission)) return null;
  const raw = submission.questions;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const questions: AoQuestion[] = [];
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

  if (questions.length === 0) return null;

  return {
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

/**
 * Generate (once) or return stored AO review questions for this student/ticket.
 * POST preferred so browsers don't cache; GET also supported.
 */
async function handleAoQuestions(ticketId: string) {
  const supabase = await createClient();
  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;

  if (!isAoReviewTicketType(context.ticket.ticket_type)) {
    return NextResponse.json(
      { error: 'AO questions are only available for ao_review tickets' },
      { status: 400 }
    );
  }

  const existing = await loadTicketProgress(context, ticketId);
  const stored = extractStoredQuestions(
    (existing?.submission as Record<string, unknown> | null | undefined) ?? null
  );

  if (stored) {
    return NextResponse.json({
      questions: stored.questions,
      generatedAt: stored.generatedAt ?? null,
      source: stored.source ?? 'stored',
      cached: true,
    });
  }

  try {
    const pkg = await compileStudentPackage({
      supabase: context.supabase,
      studentId: context.appUser.id,
      trackId: context.ticket.track_id,
      initialState: context.ticket.initial_state,
    });

    const generated = await generateAoQuestionsFromPackage(pkg);
    const now = new Date().toISOString();
    const startedAt = existing?.started_at ?? now;

    const submission = {
      type: 'ao_review',
      questions: generated.questions,
      questionsGeneratedAt: generated.generatedAt,
      questionsSource: generated.source,
      retrievedPackageSectionIds: generated.retrievedPackageSectionIds,
      retrievedGuidanceSectionIds: generated.retrievedGuidanceSectionIds,
      answers: {},
    };

    const { error: progressError } = await context.supabase
      .from('ticket_progress')
      .upsert(
        {
          student_id: context.appUser.id,
          ticket_id: ticketId,
          status: existing?.status === 'resolved' ? 'resolved' : 'in_progress',
          started_at: startedAt,
          resolved_at: existing?.resolved_at ?? null,
          submission,
        },
        { onConflict: 'student_id,ticket_id' }
      );

    if (progressError) {
      console.error('ao-questions progress upsert failed:', progressError);
      return NextResponse.json(
        { error: 'Failed to store generated AO questions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      questions: generated.questions,
      generatedAt: generated.generatedAt,
      source: generated.source,
      cached: false,
      packageComplete: pkg.complete,
      missingCodes: pkg.missingCodes,
    });
  } catch (error) {
    console.error('ao-questions generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate AO questions' },
      { status: 500 }
    );
  }
}

export async function GET(_request: Request, { params }: RouteContext) {
  return handleAoQuestions(params.ticketId);
}

export async function POST(_request: Request, { params }: RouteContext) {
  return handleAoQuestions(params.ticketId);
}
