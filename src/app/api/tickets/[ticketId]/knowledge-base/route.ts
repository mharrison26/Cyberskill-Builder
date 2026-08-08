import { NextResponse } from 'next/server';

import { compileStudentKnowledgeBase } from '@/lib/helpdesk/compileKnowledgeBase';
import { isHelpdeskCapstoneTicketType } from '@/lib/helpdesk/ticketCodes';
import { createClient } from '@/lib/supabase/server';
import { resolveSubmitTicketContext } from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const ticketType = context.ticket.ticket_type;

  if (!isHelpdeskCapstoneTicketType(ticketType)) {
    return NextResponse.json(
      {
        error:
          'Knowledge-base compilation is only available for helpdesk_capstone tickets',
      },
      { status: 400 }
    );
  }

  try {
    const kb = await compileStudentKnowledgeBase({
      supabase: context.supabase,
      studentId: context.appUser.id,
      trackId: context.ticket.track_id,
      initialState: context.ticket.initial_state,
      expectedState: context.ticket.expected_state,
    });

    return NextResponse.json({
      complete: kb.complete,
      presentCount: kb.presentCount,
      minArticles: kb.minArticles,
      sourceTicketTypes: kb.sourceTicketTypes,
      compiledAt: kb.compiledAt,
      articles: kb.articles.map((article) => ({
        ticketId: article.ticketId,
        ticketType: article.ticketType,
        ticketCode: article.ticketCode,
        title: article.title,
        status: article.status,
        summary: article.summary,
        progressStatus: article.progressStatus,
        article: article.article,
      })),
    });
  } catch (error) {
    console.error('knowledge-base compile failed:', error);
    return NextResponse.json(
      { error: 'Failed to compile knowledge base' },
      { status: 500 }
    );
  }
}
