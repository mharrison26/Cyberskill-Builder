import type { SupabaseClient } from '@supabase/supabase-js';

import { getMockTicketsByTrack } from '@/lib/mock-data';
import { mapTicketToConsoleTicket } from '@/lib/tickets/mapTicketToConsole';
import { normalizeTicketStatus } from '@/lib/tickets/status';
import type { MockTrackTicket, Ticket } from '@/types';

export type TrackConsoleTicketsResult = {
  tickets: MockTrackTicket[];
  source: 'live' | 'mock' | 'mixed';
  trackId: string | null;
  trackName: string | null;
  enrolled: boolean;
};

/**
 * Load console tickets for a track slug.
 * Prefers live Supabase rows when the user is enrolled and tickets exist;
 * otherwise returns mock placeholders so consoles remain reviewable.
 */
export async function getTrackConsoleTickets(
  supabase: SupabaseClient,
  trackSlug: string,
  studentId?: string | null
): Promise<TrackConsoleTicketsResult> {
  const mocks = getMockTicketsByTrack(trackSlug).map((ticket) => ({
    ...ticket,
    source: 'mock' as const,
    workbenchHref: null,
  }));

  const { data: track } = await supabase
    .from('tracks')
    .select('id, slug, name')
    .eq('slug', trackSlug)
    .maybeSingle();

  if (!track) {
    return {
      tickets: mocks,
      source: 'mock',
      trackId: null,
      trackName: null,
      enrolled: false,
    };
  }

  let enrolled = false;
  if (studentId) {
    const { data: enrollment } = await supabase
      .from('track_enrollments')
      .select('id')
      .eq('student_id', studentId)
      .eq('track_id', track.id)
      .eq('status', 'active')
      .maybeSingle();
    enrolled = Boolean(enrollment);
  }

  const { data: ticketRows, error } = await supabase
    .from('tickets')
    .select(
      'id, tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes, scenario_brief, initial_state, expected_state, dcwf_code, sort_order, engagement_id, engagement_stage'
    )
    .eq('track_id', track.id)
    .order('sort_order', { ascending: true });

  if (error || !ticketRows || ticketRows.length === 0) {
    return {
      tickets: mocks,
      source: 'mock',
      trackId: track.id,
      trackName: track.name,
      enrolled,
    };
  }

  const tickets = ticketRows as Ticket[];
  const ticketIds = tickets.map((t) => t.id);

  const progressByTicketId = new Map<
    string,
    { status: string; started_at: string | null }
  >();

  if (studentId && ticketIds.length > 0) {
    const { data: progressRows } = await supabase
      .from('ticket_progress')
      .select('ticket_id, status, started_at')
      .eq('student_id', studentId)
      .in('ticket_id', ticketIds);

    for (const row of progressRows ?? []) {
      progressByTicketId.set(row.ticket_id as string, {
        status: normalizeTicketStatus(row.status as string),
        started_at: (row.started_at as string | null) ?? null,
      });
    }
  }

  const live = tickets.map((ticket) => {
    const progress = progressByTicketId.get(ticket.id);
    return mapTicketToConsoleTicket({
      ticket,
      trackSlug: track.slug,
      status: progress?.status,
      startedAt: progress?.started_at,
    });
  });

  return {
    tickets: live,
    source: 'live',
    trackId: track.id,
    trackName: track.name,
    enrolled,
  };
}
