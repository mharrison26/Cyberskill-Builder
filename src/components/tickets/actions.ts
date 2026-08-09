'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  requireEnrollment,
  type AppUser,
  type Track,
} from '@/lib/auth/requireEnrollment';
import { createClient } from '@/lib/supabase/server';
import type { TicketProgressStatus } from '@/types';

export type TicketActionResult = {
  error?: string;
};

type LoadedTicketContext = {
  supabase: SupabaseClient;
  track: Track;
  user: AppUser;
  ticketId: string;
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
    .select('id, track_id')
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError || !ticket || ticket.track_id !== track.id) {
    return { error: 'Ticket not found' };
  }

  return { supabase, track, user, ticketId: ticket.id };
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

  const { supabase, user, track } = loaded;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('ticket_progress')
    .select('id, status, started_at')
    .eq('student_id', user.id)
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from('ticket_progress').insert({
      student_id: user.id,
      ticket_id: ticketId,
      status: 'in_progress' satisfies TicketProgressStatus,
      started_at: now,
      resolved_at: null,
    });

    if (error) return { error: error.message };
  } else if (existing.status === 'new') {
    const { error } = await supabase
      .from('ticket_progress')
      .update({
        status: 'in_progress' satisfies TicketProgressStatus,
        started_at: existing.started_at ?? now,
        resolved_at: null,
      })
      .eq('id', existing.id);

    if (error) return { error: error.message };
  } else if (
    existing.status === 'resolved' ||
    existing.status === 'reviewed'
  ) {
    return { error: 'This ticket is already resolved.' };
  }

  revalidatePath(`/tracks/${track.slug}/console`);
  revalidatePath(returnTo);
  return {};
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

  const { supabase, user, track } = loaded;

  const { data: existing } = await supabase
    .from('ticket_progress')
    .select('id, status, started_at')
    .eq('student_id', user.id)
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (!existing || existing.status !== 'in_progress') {
    return { error: 'Start the ticket before submitting.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('ticket_progress')
    .update({
      status: 'resolved' satisfies TicketProgressStatus,
      started_at: existing.started_at ?? now,
      resolved_at: now,
    })
    .eq('id', existing.id);

  if (error) return { error: error.message };

  revalidatePath(`/tracks/${track.slug}/console`);
  revalidatePath(returnTo);
  return {};
}
