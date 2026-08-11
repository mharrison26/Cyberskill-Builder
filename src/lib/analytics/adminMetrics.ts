import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminAnalyticsMetrics = {
  signedUpUsers: number;
  lessonsStarted: number;
  scenariosSubmitted: number;
  scenariosResolved: number;
  tracksCompleted: number;
  source: 'database';
};

/**
 * High-level funnel-ish counts from the DB when PostHog API is unavailable.
 * Not a 1:1 substitute for PostHog funnels (no unique-user step conversion).
 */
export async function loadAdminAnalyticsMetrics(
  supabase: SupabaseClient
): Promise<AdminAnalyticsMetrics> {
  const [usersRes, lessonsRes, attemptsRes, resolvedRes, credentialsRes] =
    await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase
        .from('lesson_progress')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'not_started'),
      supabase
        .from('ticket_attempts')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('ticket_progress')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'resolved'),
      supabase
        .from('track_credentials')
        .select('id', { count: 'exact', head: true })
        .is('revoked_at', null),
    ]);

  return {
    signedUpUsers: usersRes.count ?? 0,
    lessonsStarted: lessonsRes.count ?? 0,
    scenariosSubmitted: attemptsRes.count ?? 0,
    scenariosResolved: resolvedRes.count ?? 0,
    tracksCompleted: credentialsRes.count ?? 0,
    source: 'database',
  };
}
