import { NextResponse } from 'next/server';

import { getTrackConsoleTickets } from '@/lib/tickets/getTrackConsoleTickets';
import { createClient } from '@/lib/supabase/server';

type RouteContext = {
  params: { trackSlug: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const trackSlug = context.params.trackSlug?.trim();
  if (!trackSlug) {
    return NextResponse.json({ error: 'trackSlug required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const result = await getTrackConsoleTickets(
    supabase,
    trackSlug,
    user?.id ?? null
  );

  return NextResponse.json(result);
}
