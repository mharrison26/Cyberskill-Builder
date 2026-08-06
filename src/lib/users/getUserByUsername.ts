import { createPublicClient } from '@/lib/supabase/public';

export type PublicUser = {
  id: string;
  email: string;
  username: string | null;
};

/**
 * Resolve a portfolio slug to a user.
 *
 * Lookup order (see migration 0011):
 * 1. Explicit `users.username` (case-insensitive)
 * 2. Email slug: local-part with dots replaced by hyphens, lowercased
 */
export async function getUserByUsername(
  username: string
): Promise<PublicUser | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc('get_user_by_username', {
    p_username: username,
  });

  if (error) {
    console.error('[getUserByUsername]', error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username ?? null,
  };
}

/** Display name derived from email local part until display_name exists. */
export function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email;
  return localPart
    .split('.')
    .map((segment) =>
      segment ? segment.charAt(0).toUpperCase() + segment.slice(1) : segment
    )
    .join(' ');
}
