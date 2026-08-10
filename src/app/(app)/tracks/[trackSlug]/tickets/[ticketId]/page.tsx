import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EngagementStageNav } from '@/components/tickets/EngagementStageNav';
import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { TicketAttemptPanel } from '@/components/tickets/TicketAttemptPanel';
import { TicketWorkbenchFormGate } from '@/components/tickets/TicketWorkbenchFormGate';
import { TicketWorkbenchHeader } from '@/components/tickets/TicketWorkbenchHeader';
import { TicketWorkbenchProvider } from '@/components/tickets/TicketWorkbenchProvider';
import { TicketWorkSlot } from '@/components/tickets/TicketWorkSlot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { requireEnrollment } from '@/lib/auth/requireEnrollment';
import type { TicketAttemptRecord } from '@/lib/tickets/attempts';
import {
  buildEngagementFlowView,
  isEngagementTicket,
  type EngagementSummary,
  type EngagementTicket,
} from '@/lib/tickets/engagement';
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
  let resolvedAt: string | null = null;
  let slaDueAt: string | null = null;
  let slaMet: boolean | null = null;
  let submission: Record<string, unknown> | null = null;
  let lastScoreStatus: 'resolved' | 'needs_revision' | null = null;
  let lastFeedback: string | null = null;
  let lastStructuredResult: Record<string, unknown> | null = null;
  let attemptCount = 0;
  let attempts: TicketAttemptRecord[] = [];

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
      'id, tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes, max_attempts, scenario_brief, initial_state, expected_state, dcwf_code, sort_order, engagement_id, engagement_stage'
    )
    .eq('id', ticketId)
    .maybeSingle<Ticket>();

  if (ticketError || !ticket || ticket.track_id !== track.id) {
    notFound();
  }

  if (!isPreview && userId) {
    const { data: progress } = await supabase
      .from('ticket_progress')
      .select(
        'status, started_at, resolved_at, sla_due_at, sla_met, submission, last_score_status, last_feedback, last_structured_result, attempt_count'
      )
      .eq('student_id', userId)
      .eq('ticket_id', ticketId)
      .maybeSingle();

    status = normalizeTicketStatus(progress?.status);
    startedAt = progress?.started_at ?? null;
    resolvedAt = progress?.resolved_at ?? null;
    slaDueAt = progress?.sla_due_at ?? null;
    slaMet = typeof progress?.sla_met === 'boolean' ? progress.sla_met : null;
    submission =
      progress?.submission &&
      typeof progress.submission === 'object' &&
      !Array.isArray(progress.submission)
        ? (progress.submission as Record<string, unknown>)
        : null;
    lastScoreStatus =
      progress?.last_score_status === 'resolved' ||
      progress?.last_score_status === 'needs_revision'
        ? progress.last_score_status
        : null;
    lastFeedback =
      typeof progress?.last_feedback === 'string'
        ? progress.last_feedback
        : null;
    lastStructuredResult =
      progress?.last_structured_result &&
      typeof progress.last_structured_result === 'object' &&
      !Array.isArray(progress.last_structured_result)
        ? (progress.last_structured_result as Record<string, unknown>)
        : null;
    attemptCount =
      typeof progress?.attempt_count === 'number' ? progress.attempt_count : 0;

    const { data: attemptRows } = await supabase
      .from('ticket_attempts')
      .select(
        'id, attempt_number, submitted_at, score_status, feedback, submission, structured_result, sla_started_at, sla_due_at, sla_resolved_at, sla_met'
      )
      .eq('student_id', userId)
      .eq('ticket_id', ticketId)
      .order('attempt_number', { ascending: true });

    attempts = (attemptRows ?? []).map((row) => ({
      id: row.id as string,
      attempt_number: row.attempt_number as number,
      submitted_at: row.submitted_at as string,
      score_status: row.score_status as 'resolved' | 'needs_revision',
      feedback: (row.feedback as string | null) ?? null,
      submission:
        row.submission &&
        typeof row.submission === 'object' &&
        !Array.isArray(row.submission)
          ? (row.submission as Record<string, unknown>)
          : {},
      structured_result:
        row.structured_result &&
        typeof row.structured_result === 'object' &&
        !Array.isArray(row.structured_result)
          ? (row.structured_result as Record<string, unknown>)
          : {},
      sla_started_at: (row.sla_started_at as string | null) ?? null,
      sla_due_at: (row.sla_due_at as string | null) ?? null,
      sla_resolved_at: (row.sla_resolved_at as string | null) ?? null,
      sla_met: typeof row.sla_met === 'boolean' ? row.sla_met : null,
    }));
  }

  let engagementFlow = null as ReturnType<
    typeof buildEngagementFlowView
  > | null;
  let stageLocked = false;

  if (isEngagementTicket(ticket)) {
    const { data: engagementRow } = await supabase
      .from('engagements')
      .select('id, slug, title, scope, sort_order')
      .eq('id', ticket.engagement_id)
      .maybeSingle();

    const { data: siblingRows } = await supabase
      .from('tickets')
      .select(
        'id, ticket_type, scenario_brief, difficulty, sla_minutes, sort_order, tier, engagement_id, engagement_stage'
      )
      .eq('engagement_id', ticket.engagement_id)
      .order('engagement_stage', { ascending: true });

    const siblings = (siblingRows ?? []).filter(isEngagementTicket);

    if (engagementRow) {
      const siblingIds = siblings.map((s) => s.id);
      const progressMap = new Map<
        string,
        TicketProgressStatus | null | undefined
      >();

      if (!isPreview && userId && siblingIds.length > 0) {
        const { data: siblingProgress } = await supabase
          .from('ticket_progress')
          .select('ticket_id, status')
          .eq('student_id', userId)
          .in('ticket_id', siblingIds);

        for (const row of siblingProgress ?? []) {
          progressMap.set(
            row.ticket_id as string,
            normalizeTicketStatus(row.status as string)
          );
        }
      }

      progressMap.set(ticket.id, status);

      const engagement: EngagementSummary = {
        id: engagementRow.id as string,
        slug: engagementRow.slug as string,
        title: engagementRow.title as string,
        scope:
          engagementRow.scope &&
          typeof engagementRow.scope === 'object' &&
          !Array.isArray(engagementRow.scope)
            ? (engagementRow.scope as Record<string, unknown>)
            : {},
        sort_order: (engagementRow.sort_order as number) ?? 0,
      };

      engagementFlow = buildEngagementFlowView({
        engagement,
        tickets: siblings as EngagementTicket[],
        progressByTicketId: progressMap,
        trackSlug,
        forceUnlock: isPreview,
      });

      const currentStage = engagementFlow.stages.find(
        (s) => s.ticket.id === ticket.id
      );
      stageLocked = Boolean(currentStage && !currentStage.unlocked);
    }
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

        {engagementFlow ? (
          <EngagementStageNav
            flow={engagementFlow}
            currentTicketId={ticket.id}
          />
        ) : null}

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
            {ticket.engagement_stage ? (
              <Badge variant="outline">Stage {ticket.engagement_stage}</Badge>
            ) : null}
          </div>

          <h1 className="text-2xl font-semibold leading-snug">
            {ticket.scenario_brief}
          </h1>
        </header>
      </div>

      {stageLocked ? (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-5 text-sm"
        >
          <p className="font-medium">Stage locked</p>
          <p className="mt-1 text-muted-foreground">
            Resolve the previous engagement stage before working this ticket.
            Use the stage navigation above to return to the current unlocked
            stage.
          </p>
        </div>
      ) : (
        <TicketWorkbenchProvider
          initial={{
            ticketId: ticket.id,
            trackSlug,
            status,
            startedAt,
            resolvedAt,
            slaDueAt,
            slaMet,
            submission,
            lastScoreStatus,
            lastFeedback,
            lastStructuredResult,
            attemptCount,
            maxAttempts: ticket.max_attempts,
            attempts,
            readOnlyPreview: isPreview,
          }}
        >
          <TicketWorkbenchHeader slaMinutes={ticket.sla_minutes} />

          <section
            aria-labelledby="scenario-brief-heading"
            className="space-y-2"
          >
            <h2 id="scenario-brief-heading" className="text-lg font-semibold">
              Scenario brief
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {ticket.scenario_brief}
            </p>
          </section>

          <TicketWorkbenchFormGate>
            {({ readOnly, formKey }) => (
              <TicketWorkSlot
                key={formKey}
                ticket={ticket}
                readOnly={readOnly}
              />
            )}
          </TicketWorkbenchFormGate>

          <TicketAttemptPanel />
        </TicketWorkbenchProvider>
      )}
    </div>
  );
}
