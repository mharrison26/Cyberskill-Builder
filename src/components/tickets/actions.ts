'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import { captureScenarioStarted } from '@/lib/analytics/capture';
import { scenarioPropsFromTicket } from '@/lib/analytics/events';
import {
  requireEnrollment,
  type AppUser,
  type Track,
} from '@/lib/auth/requireEnrollment';
import { canStartNewAttempt, resolveMaxAttempts } from '@/lib/tickets/attempts';
import { computeSlaDueAt, wasResolvedWithinSla } from '@/lib/tickets/sla';
import { createClient } from '@/lib/supabase/server';
import type { TicketProgressStatus } from '@/types';

export type TicketActionResult = {
  error?: string;
  startedAt?: string;
  slaDueAt?: string | null;
  resolvedAt?: string | null;
  slaMet?: boolean | null;
};

type LoadedTicketContext = {
  supabase: SupabaseClient;
  track: Track;
  user: AppUser;
  ticketId: string;
  slaMinutes: number;
  maxAttempts: number | null;
  ticketType: string;
  tier: number | string;
  initialState: Record<string, unknown> | null;
  expectedState: Record<string, unknown> | null;
};

async function loadTicketForStudent(
  trackSlug: string,
  ticketId: string,
  returnTo: string
): Promise<LoadedTicketContext | { error: string }> {
  const supabase = await createClient();
  const { track, user } = await requireEnrollment(
    supabase,
    trackSlug,
    returnTo
  );

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select(
      'id, track_id, sla_minutes, max_attempts, ticket_type, tier, initial_state, expected_state'
    )
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError || !ticket || ticket.track_id !== track.id) {
    return { error: 'Ticket not found' };
  }

  return {
    supabase,
    track,
    user,
    ticketId: ticket.id,
    slaMinutes: ticket.sla_minutes as number,
    maxAttempts: (ticket.max_attempts as number | null) ?? null,
    ticketType: ticket.ticket_type as string,
    tier: ticket.tier as number | string,
    initialState:
      (ticket.initial_state as Record<string, unknown> | null) ?? null,
    expectedState:
      (ticket.expected_state as Record<string, unknown> | null) ?? null,
  };
}

export async function startTicket(
  trackSlug: string,
  ticketId: string
): Promise<TicketActionResult> {
  const returnTo = `/tracks/${trackSlug}/tickets/${ticketId}`;
  const loaded = await loadTicketForStudent(trackSlug, ticketId, returnTo);
  if ('error' in loaded) {
    return { error: loaded.error };
  }

  const { supabase, user, track, slaMinutes } = loaded;
  const now = new Date().toISOString();
  const slaDueAt = computeSlaDueAt(now, slaMinutes);
  const scenarioProps = scenarioPropsFromTicket({
    id: ticketId,
    ticket_type: loaded.ticketType,
    tier: loaded.tier,
    track_id: track.id,
    track_slug: track.slug,
    initial_state: loaded.initialState,
    expected_state: loaded.expectedState,
  });

  const { data: existing } = await supabase
    .from('ticket_progress')
    .select('id, status, started_at, sla_due_at')
    .eq('student_id', user.id)
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (!existing) {
    const { data, error } = await supabase
      .from('ticket_progress')
      .insert({
        student_id: user.id,
        ticket_id: ticketId,
        status: 'in_progress' satisfies TicketProgressStatus,
        started_at: now,
        sla_due_at: slaDueAt,
        resolved_at: null,
        sla_met: null,
      })
      .select('started_at, sla_due_at')
      .single();

    if (error) return { error: error.message };

    void captureScenarioStarted(user.id, scenarioProps);

    revalidatePath(`/tracks/${track.slug}/console`);
    revalidatePath(returnTo);
    return {
      startedAt: data.started_at as string,
      slaDueAt: (data.sla_due_at as string | null) ?? slaDueAt,
    };
  }

  if (existing.status === 'new' || !existing.started_at) {
    const startedAt = existing.started_at ?? now;
    const due = existing.sla_due_at ?? computeSlaDueAt(startedAt, slaMinutes);
    const { data, error } = await supabase
      .from('ticket_progress')
      .update({
        status: 'in_progress' satisfies TicketProgressStatus,
        started_at: startedAt,
        sla_due_at: due,
        resolved_at: null,
        sla_met: null,
      })
      .eq('id', existing.id)
      .select('started_at, sla_due_at')
      .single();

    if (error) return { error: error.message };

    void captureScenarioStarted(user.id, scenarioProps);

    revalidatePath(`/tracks/${track.slug}/console`);
    revalidatePath(returnTo);
    return {
      startedAt: data.started_at as string,
      slaDueAt: (data.sla_due_at as string | null) ?? due,
    };
  }

  if (existing.status === 'resolved' || existing.status === 'reviewed') {
    return { error: 'This ticket is already resolved. Use Retry scenario.' };
  }

  // Already in progress — idempotent open.
  revalidatePath(`/tracks/${track.slug}/console`);
  revalidatePath(returnTo);
  return {
    startedAt: existing.started_at as string,
    slaDueAt: (existing.sla_due_at as string | null) ?? null,
  };
}

export async function resolveTicket(
  trackSlug: string,
  ticketId: string
): Promise<TicketActionResult> {
  const returnTo = `/tracks/${trackSlug}/tickets/${ticketId}`;
  const loaded = await loadTicketForStudent(trackSlug, ticketId, returnTo);
  if ('error' in loaded) {
    return { error: loaded.error };
  }

  const { supabase, user, track, slaMinutes } = loaded;

  const { data: existing } = await supabase
    .from('ticket_progress')
    .select('id, status, started_at, sla_due_at')
    .eq('student_id', user.id)
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (!existing || existing.status !== 'in_progress' || !existing.started_at) {
    return { error: 'Open the ticket before resolving.' };
  }

  const now = new Date().toISOString();
  const slaMet = wasResolvedWithinSla(existing.started_at, now, slaMinutes);
  const slaDueAt =
    existing.sla_due_at ?? computeSlaDueAt(existing.started_at, slaMinutes);

  const { data, error } = await supabase
    .from('ticket_progress')
    .update({
      status: 'resolved' satisfies TicketProgressStatus,
      started_at: existing.started_at,
      sla_due_at: slaDueAt,
      resolved_at: now,
      sla_met: slaMet,
    })
    .eq('id', existing.id)
    .select('started_at, sla_due_at, resolved_at, sla_met')
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/tracks/${track.slug}/console`);
  revalidatePath(returnTo);
  return {
    startedAt: data.started_at as string,
    slaDueAt: (data.sla_due_at as string | null) ?? slaDueAt,
    resolvedAt: data.resolved_at as string,
    slaMet: (data.sla_met as boolean | null) ?? slaMet,
  };
}

/**
 * Explicitly start a new graded attempt after a prior resolution.
 * Resets the SLA clock and clears the live submission so the form is blank.
 */
export async function retryTicket(
  trackSlug: string,
  ticketId: string
): Promise<TicketActionResult> {
  const returnTo = `/tracks/${trackSlug}/tickets/${ticketId}`;
  const loaded = await loadTicketForStudent(trackSlug, ticketId, returnTo);
  if ('error' in loaded) {
    return { error: loaded.error };
  }

  const { supabase, user, track, slaMinutes, maxAttempts } = loaded;

  const { data: existing } = await supabase
    .from('ticket_progress')
    .select(
      'id, status, started_at, resolved_at, attempt_count, submission, last_score_status'
    )
    .eq('student_id', user.id)
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (!existing) {
    return { error: 'Open and complete the ticket before retrying.' };
  }

  const canRetryStatus =
    existing.status === 'resolved' ||
    existing.status === 'reviewed' ||
    (existing.status === 'in_progress' &&
      existing.last_score_status === 'needs_revision');

  if (!canRetryStatus) {
    return {
      error:
        'Retry is available after a graded result (resolved or needs revision).',
    };
  }

  const attemptCount = (existing.attempt_count as number) ?? 0;
  const limit = resolveMaxAttempts(maxAttempts);
  if (!canStartNewAttempt({ attemptCount, maxAttempts: limit })) {
    return {
      error: `Maximum attempts reached (${limit}).`,
    };
  }

  const now = new Date().toISOString();
  const slaDueAt = computeSlaDueAt(now, slaMinutes);

  const { data, error } = await supabase
    .from('ticket_progress')
    .update({
      status: 'in_progress' satisfies TicketProgressStatus,
      started_at: now,
      sla_due_at: slaDueAt,
      resolved_at: null,
      sla_met: null,
      submission: null,
      last_score_status: null,
      last_feedback: null,
      last_structured_result: null,
    })
    .eq('id', existing.id)
    .select('started_at, sla_due_at')
    .single();

  if (error) return { error: error.message };

  revalidatePath(`/tracks/${track.slug}/console`);
  revalidatePath(returnTo);
  return {
    startedAt: data.started_at as string,
    slaDueAt: (data.sla_due_at as string | null) ?? slaDueAt,
  };
}
