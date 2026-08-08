import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SlaCountdown } from '@/components/tickets/SlaCountdown';
import { TicketStatusControl } from '@/components/tickets/TicketStatusControl';
import { TicketWorkSlot } from '@/components/tickets/TicketWorkSlot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { requireEnrollment } from '@/lib/auth/requireEnrollment';
import { normalizeTicketStatus } from '@/lib/tickets/status';
import { createClient } from '@/lib/supabase/server';
import type { Ticket, TicketProgressStatus } from '@/types';

type TicketPageProps = {
  params: { trackSlug: string; ticketId: string };
  searchParams?: { preview?: string };
};

export async function generateMetadata({
  params,
}: TicketPageProps): Promise<Metadata> {
  const supabase = await createClient();
  const { data: ticket } = await supabase
    .from('tickets')
    .select('scenario_brief')
    .eq('id', params.ticketId)
    .maybeSingle();

  return {
    title: ticket?.scenario_brief ?? 'Ticket',
  };
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: TicketPageProps) {
  const { trackSlug, ticketId } = params;
  const isPreview = searchParams?.preview === '1';
  const returnTo = `/tracks/${trackSlug}/tickets/${ticketId}`;
  const supabase = await createClient();

  let track: { id: string; slug: string; name: string };
  let userId: string | null = null;
  let status: TicketProgressStatus = 'new';
  let startedAt: string | null = null;

  if (isPreview) {
    await requireAdmin(supabase);

    const { data: trackRow, error: trackError } = await supabase
      .from('tracks')
      .select('id, slug, name')
      .eq('slug', trackSlug)
      .maybeSingle();

    if (trackError || !trackRow) {
      notFound();
    }
    track = trackRow;
  } else {
    const enrollment = await requireEnrollment(supabase, trackSlug, returnTo);
    track = enrollment.track;
    userId = enrollment.user.id;
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select(
      'id, tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes, scenario_brief, initial_state, expected_state, dcwf_code, sort_order'
    )
    .eq('id', ticketId)
    .maybeSingle<Ticket>();

  if (ticketError || !ticket || ticket.track_id !== track.id) {
    notFound();
  }

  if (!isPreview && userId) {
    const { data: progress } = await supabase
      .from('ticket_progress')
      .select('status, started_at, resolved_at')
      .eq('student_id', userId)
      .eq('ticket_id', ticketId)
      .maybeSingle();

    status = normalizeTicketStatus(progress?.status);
    startedAt = progress?.started_at ?? null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {isPreview ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
        >
          <p className="font-medium">Admin preview</p>
          <p className="mt-0.5 text-muted-foreground">
            Read-only student view. Status changes and submissions are disabled.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            {track.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {isPreview ? (
              <Button
                render={<Link href="/admin/tickets" />}
                variant="outline"
                size="sm"
              >
                Back to admin
              </Button>
            ) : (
              <Button
                render={<Link href={`/tracks/${trackSlug}/console`} />}
                variant="outline"
                size="sm"
              >
                Back to console
              </Button>
            )}
          </div>
        </div>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge difficulty={ticket.difficulty} />
            <Badge variant="outline">Tier {ticket.tier}</Badge>
            <Badge variant="secondary" className="capitalize">
              {ticket.ticket_type.replace(/_/g, ' ')}
            </Badge>
            {ticket.dcwf_code ? (
              <Badge variant="outline">DCWF {ticket.dcwf_code}</Badge>
            ) : null}
          </div>

          <h1 className="text-2xl font-semibold leading-snug">
            {ticket.scenario_brief}
          </h1>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">SLA</span>
              <SlaCountdown
                slaMinutes={ticket.sla_minutes}
                startedAt={startedAt}
              />
            </div>
          </div>
        </header>
      </div>

      <TicketStatusControl
        trackSlug={trackSlug}
        ticketId={ticket.id}
        status={status}
        readOnly={isPreview}
      />

      <section aria-labelledby="scenario-brief-heading" className="space-y-2">
        <h2 id="scenario-brief-heading" className="text-lg font-semibold">
          Scenario brief
        </h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {ticket.scenario_brief}
        </p>
      </section>

      <TicketWorkSlot ticket={ticket} readOnly={isPreview} />
    </div>
  );
}
