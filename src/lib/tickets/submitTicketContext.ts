import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

import type { Ticket, TicketProgress } from '@/types';

export type SubmitTicketContext = {
  supabase: SupabaseClient;
  authUserId: string;
  appUser: {
    id: string;
    tenant_id: string;
    email: string;
  };
  ticket: Ticket;
};

export async function resolveSubmitTicketContext(
  supabase: SupabaseClient,
  ticketId: string
): Promise<
  | { ok: true; context: SubmitTicketContext }
  | { ok: false; response: NextResponse }
> {
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, email')
    .eq('id', authUser.id)
    .maybeSingle();

  if (userError || !appUser) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'User profile not found' },
        { status: 403 }
      ),
    };
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select(
      'id, tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes, scenario_brief, initial_state, expected_state, dcwf_code, sort_order'
    )
    .eq('id', ticketId)
    .maybeSingle();

  if (ticketError || !ticket) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      ),
    };
  }

  if (ticket.tenant_id !== appUser.tenant_id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      ),
    };
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('track_enrollments')
    .select('id')
    .eq('student_id', appUser.id)
    .eq('track_id', ticket.track_id)
    .eq('status', 'active')
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Active enrollment required for this track' },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    context: {
      supabase,
      authUserId: authUser.id,
      appUser,
      ticket: {
        ...ticket,
        initial_state:
          (ticket.initial_state as Record<string, unknown> | null) ?? {},
        expected_state:
          (ticket.expected_state as Record<string, unknown> | null) ?? {},
      },
    },
  };
}

export async function loadTicketProgress(
  context: SubmitTicketContext,
  ticketId: string
): Promise<TicketProgress | null> {
  const { data, error } = await context.supabase
    .from('ticket_progress')
    .select(
      'id, student_id, ticket_id, status, started_at, resolved_at, submission'
    )
    .eq('student_id', context.appUser.id)
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (error) {
    console.error('ticket_progress load failed:', error);
    return null;
  }

  return data as TicketProgress | null;
}
