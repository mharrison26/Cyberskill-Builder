import { getTrackConsoleTickets } from '@/lib/tickets/getTrackConsoleTickets';
import { createClient } from '@/lib/supabase/server';

export async function loadConsolePageData(trackSlug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return getTrackConsoleTickets(supabase, trackSlug, user?.id ?? null);
}
