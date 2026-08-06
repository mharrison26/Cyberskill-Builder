import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Stateless anon Supabase client for public, unauthenticated server reads.
 * Relies on RLS policies and SECURITY DEFINER RPCs — never use the service role key here.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
