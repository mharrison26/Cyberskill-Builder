import { NextResponse } from 'next/server';

import {
  buildConmonSystemProfileGapsMessage,
  compileConmonSystemProfile,
  seedSystemProfileFromInitialState,
  usesStudentConmonSystemProfile,
} from '@/lib/grc/compileConmonSystemProfile';
import { isConMonStrategyTicketType } from '@/lib/scoring/conmonStrategy';
import { createClient } from '@/lib/supabase/server';
import { resolveSubmitTicketContext } from '@/lib/tickets/submitTicketContext';

type RouteContext = {
  params: { ticketId: string };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * GET — resolve the ConMon system profile for a ticket.
 *
 * For GRC-06 conmon_strategy tickets with useStudentSystemProfile, joins the
 * student's GRC-03 OSCAL SSP system description (no HarborNet / canned
 * scenario fallback). Other tickets return seeded initial_state.systemProfile.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { ticketId } = params;
  const supabase = await createClient();

  const resolved = await resolveSubmitTicketContext(supabase, ticketId);
  if (!resolved.ok) {
    return resolved.response;
  }

  const { context } = resolved;
  const initialState = isPlainObject(context.ticket.initial_state)
    ? context.ticket.initial_state
    : {};

  if (
    isConMonStrategyTicketType(context.ticket.ticket_type) &&
    usesStudentConmonSystemProfile(initialState)
  ) {
    const compiled = await compileConmonSystemProfile({
      supabase: context.supabase,
      studentId: context.appUser.id,
      trackId: context.ticket.track_id,
      initialState,
    });

    return NextResponse.json({
      systemProfile: compiled.systemProfile,
      systemProfileSource: compiled.source,
      complete: compiled.complete,
      gaps: compiled.gaps,
      gapsMessage: buildConmonSystemProfileGapsMessage(compiled.gaps),
      sspTicketId: compiled.sspTicketId,
      continuityLabel: compiled.continuityLabel,
      useStudentSystemProfile: true,
    });
  }

  const seedProfile = seedSystemProfileFromInitialState(initialState);

  return NextResponse.json({
    systemProfile: seedProfile,
    systemProfileSource: seedProfile ? 'seed' : 'empty',
    complete: Boolean(seedProfile),
    gaps: [],
    gapsMessage: null,
    sspTicketId: null,
    continuityLabel: null,
    useStudentSystemProfile: false,
  });
}
