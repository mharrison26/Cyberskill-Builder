import type { Metadata } from 'next';

import {
  AdminTicketsTable,
  type AdminTicketRow,
  type AdminTrackOption,
} from '@/components/admin/AdminTicketsTable';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Admin — Tickets',
  description: 'Manage ticket scenarios across training tracks.',
};

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{\n  \n}';
  }
}

export default async function AdminTicketsPage() {
  const supabase = await createClient();

  const [
    { data: tracks, error: tracksError },
    { data: tickets, error: ticketsError },
  ] = await Promise.all([
    supabase
      .from('tracks')
      .select('id, slug, name')
      .order('name', { ascending: true }),
    supabase
      .from('tickets')
      .select(
        `
          id,
          track_id,
          tier,
          ticket_type,
          difficulty,
          sla_minutes,
          scenario_brief,
          initial_state,
          expected_state,
          sort_order,
          track:tracks!tickets_track_id_fkey(id, slug, name)
        `
      )
      .order('sort_order', { ascending: true }),
  ]);

  if (tracksError) {
    throw new Error(`Failed to load tracks: ${tracksError.message}`);
  }
  if (ticketsError) {
    throw new Error(`Failed to load tickets: ${ticketsError.message}`);
  }

  const trackOptions: AdminTrackOption[] = (tracks ?? []).map((track) => ({
    id: track.id,
    name: track.name,
    slug: track.slug,
  }));

  const rows: AdminTicketRow[] = (tickets ?? []).map((ticket) => {
    const track = Array.isArray(ticket.track) ? ticket.track[0] : ticket.track;

    return {
      id: ticket.id,
      track_id: ticket.track_id,
      trackName: track?.name ?? 'Unknown track',
      trackSlug: track?.slug ?? '',
      tier: ticket.tier,
      ticket_type: ticket.ticket_type,
      difficulty: ticket.difficulty,
      sla_minutes: ticket.sla_minutes,
      scenario_brief: ticket.scenario_brief,
      initial_state: stringifyJson(ticket.initial_state),
      expected_state: stringifyJson(ticket.expected_state),
      sort_order: ticket.sort_order,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="mt-1 text-muted-foreground">
          Ticket catalog across all training tracks. Create and edit scenarios,
          then preview the student-facing detail view.
        </p>
      </header>

      <AdminTicketsTable rows={rows} tracks={trackOptions} />
    </div>
  );
}
