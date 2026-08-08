import type { Metadata } from 'next';
import Link from 'next/link';

import {
  TicketQueueTable,
  type TicketQueueRow,
} from '@/components/tickets/TicketQueueTable';
import { Button } from '@/components/ui/button';
import { requireEnrollment } from '@/lib/auth/requireEnrollment';
import { getActiveTicketTier } from '@/lib/tickets/activeTier';
import {
  isOpenTicketStatus,
  normalizeTicketStatus,
} from '@/lib/tickets/status';
import { createClient } from '@/lib/supabase/server';
import type { Ticket, TicketProgressStatus } from '@/types';

type ConsolePageProps = {
  params: { trackSlug: string };
};

export async function generateMetadata({
  params,
}: ConsolePageProps): Promise<Metadata> {
  const supabase = await createClient();
  const { data: track } = await supabase
    .from('tracks')
    .select('name')
    .eq('slug', params.trackSlug)
    .maybeSingle();

  return {
    title: track?.name ? `${track.name} Console` : 'Ticket Console',
  };
}

export default async function TrackConsolePage({ params }: ConsolePageProps) {
  const { trackSlug } = params;
  const returnTo = `/tracks/${trackSlug}/console`;
  const supabase = await createClient();

  const { track, user } = await requireEnrollment(
    supabase,
    trackSlug,
    returnTo
  );

  const { data: tickets, error: ticketsError } = await supabase
    .from('tickets')
    .select(
      'id, tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes, scenario_brief, initial_state, expected_state, dcwf_code, sort_order'
    )
    .eq('track_id', track.id)
    .order('sort_order', { ascending: true });

  if (ticketsError) {
    throw new Error(`Failed to load tickets: ${ticketsError.message}`);
  }

  const ticketRows = (tickets ?? []) as Ticket[];
  const ticketIds = ticketRows.map((t) => t.id);

  const { data: progressRows } =
    ticketIds.length > 0
      ? await supabase
          .from('ticket_progress')
          .select('ticket_id, status, started_at')
          .eq('student_id', user.id)
          .in('ticket_id', ticketIds)
      : { data: [] };

  const progressByTicketId = new Map(
    (progressRows ?? []).map((row) => [
      row.ticket_id as string,
      {
        status: normalizeTicketStatus(row.status as string),
        started_at: (row.started_at as string | null) ?? null,
      },
    ])
  );

  const statusMap = new Map<string, TicketProgressStatus>(
    Array.from(progressByTicketId.entries()).map(([id, p]) => [id, p.status])
  );

  const activeTier = getActiveTicketTier(ticketRows, statusMap);

  const openRows: TicketQueueRow[] = ticketRows
    .filter((ticket) => ticket.tier === activeTier)
    .map((ticket) => {
      const progress = progressByTicketId.get(ticket.id);
      const status = progress?.status ?? 'new';
      return {
        id: ticket.id,
        scenarioBrief: ticket.scenario_brief,
        ticketType: ticket.ticket_type,
        difficulty: ticket.difficulty,
        slaMinutes: ticket.sla_minutes,
        startedAt: progress?.started_at ?? null,
        status,
        href: `/tracks/${trackSlug}/tickets/${ticket.id}`,
      };
    })
    .filter((row) => isOpenTicketStatus(row.status));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          {track.name}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Ticket console</h1>
            <p className="mt-1 text-muted-foreground">
              Open tickets for your active tier (Tier {activeTier}).
            </p>
          </div>
          <Button render={<Link href="/dashboard" />} variant="outline">
            Back to dashboard
          </Button>
        </div>
      </header>

      {ticketRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
          <h2 className="text-lg font-semibold">No tickets yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This track does not have published tickets. Check back once ticket
            scenarios are available.
          </p>
        </div>
      ) : (
        <TicketQueueTable
          rows={openRows}
          emptyMessage="No open tickets in your active tier."
        />
      )}
    </div>
  );
}
