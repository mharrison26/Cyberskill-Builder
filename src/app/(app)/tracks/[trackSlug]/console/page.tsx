import type { Metadata } from 'next';
import Link from 'next/link';

import { EngagementFlowCard } from '@/components/tickets/EngagementFlowCard';
import {
  TicketQueueTable,
  type TicketQueueRow,
} from '@/components/tickets/TicketQueueTable';
import { Button } from '@/components/ui/button';
import { requireEnrollment } from '@/lib/auth/requireEnrollment';
import { getActiveTicketTier } from '@/lib/tickets/activeTier';
import {
  groupTicketsByEngagement,
  type EngagementSummary,
} from '@/lib/tickets/engagement';
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

/**
 * Generic ticket console fallback.
 * Track-specific consoles (e.g. /tracks/grc/console) take precedence via
 * static App Router segments and compose shared ticket primitives differently.
 */
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
      'id, tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes, scenario_brief, initial_state, expected_state, dcwf_code, sort_order, engagement_id, engagement_stage'
    )
    .eq('track_id', track.id)
    .eq('tenant_id', user.tenant_id)
    .order('sort_order', { ascending: true });

  if (ticketsError) {
    throw new Error(`Failed to load tickets: ${ticketsError.message}`);
  }

  const ticketRows = (tickets ?? []) as Ticket[];
  const ticketIds = ticketRows.map((t) => t.id);

  const engagementIds = Array.from(
    new Set(
      ticketRows
        .map((t) => t.engagement_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );

  const { data: engagementRows } =
    engagementIds.length > 0
      ? await supabase
          .from('engagements')
          .select('id, slug, title, scope, sort_order')
          .in('id', engagementIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  const engagements = (engagementRows ?? []).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    scope:
      row.scope && typeof row.scope === 'object' && !Array.isArray(row.scope)
        ? (row.scope as Record<string, unknown>)
        : {},
    sort_order: (row.sort_order as number) ?? 0,
  })) satisfies EngagementSummary[];

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

  const tierTickets = ticketRows.filter((ticket) => ticket.tier === activeTier);

  const { flows, standalone } = groupTicketsByEngagement({
    engagements,
    tickets: tierTickets,
    progressByTicketId: statusMap,
    trackSlug,
  });

  const openStandaloneRows: TicketQueueRow[] = standalone
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

  const hasContent = flows.length > 0 || openStandaloneRows.length > 0;

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
              Open tickets for your active tier (Tier {activeTier}). Multi-stage
              engagements appear as one sequenced flow.
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
      ) : !hasContent ? (
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No open tickets in your active tier.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {flows.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-base font-semibold">Engagements</h2>
              {flows.map((flow) => (
                <EngagementFlowCard key={flow.engagement.id} flow={flow} />
              ))}
            </div>
          ) : null}

          {openStandaloneRows.length > 0 ? (
            <div className="space-y-4">
              {flows.length > 0 ? (
                <h2 className="text-base font-semibold">Other open tickets</h2>
              ) : null}
              <TicketQueueTable
                rows={openStandaloneRows}
                emptyMessage="No open tickets in your active tier."
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
