import { NextResponse } from 'next/server';

import {
  buildPoamSourceGapsMessage,
  compilePoamSourceFindings,
  usesStudentPoamSourceFindings,
} from '@/lib/grc/compilePoamSourceFindings';
import { isPoamTicketType } from '@/lib/scoring/poam';
import { parsePriorFindings } from '@/lib/scoring/ticketUi';
import { createClient } from '@/lib/supabase/server';
import { resolveSubmitTicketContext } from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * GET — resolve prior findings for a ticket.
 *
 * For GRC-04 POA&M tickets with useStudentSourceFindings, joins the student's
 * IAM lab oscal_findings + L02 lesson_progress (no generic seed fallback).
 * Other tickets return seeded initial_state.prior_findings when present.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const initialState = isPlainObject(context.ticket.initial_state)
    ? context.ticket.initial_state
    : {};

  if (
    isPoamTicketType(context.ticket.ticket_type) &&
    usesStudentPoamSourceFindings(initialState)
  ) {
    const compiled = await compilePoamSourceFindings({
      supabase: context.supabase,
      studentId: context.appUser.id,
      trackId: context.ticket.track_id,
      initialState,
    });

    return NextResponse.json({
      priorFindings: compiled.findings,
      priorFindingsSource: compiled.source,
      complete: compiled.complete,
      gaps: compiled.gaps,
      gapsMessage: buildPoamSourceGapsMessage(compiled.gaps),
      iamLessonTitle: compiled.iamLessonTitle,
      l02LessonTitle: compiled.l02LessonTitle,
      useStudentSourceFindings: true,
    });
  }

  const seedFindings = parsePriorFindings(initialState).map((finding) => ({
    ...finding,
    source: 'seed' as const,
    lessonTitle: finding.title ?? finding.id,
  }));

  return NextResponse.json({
    priorFindings: seedFindings,
    priorFindingsSource: seedFindings.length > 0 ? 'seed' : 'empty',
    complete: seedFindings.length > 0,
    gaps: [],
    gapsMessage: null,
    useStudentSourceFindings: false,
  });
}
