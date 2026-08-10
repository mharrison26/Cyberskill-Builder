import { createPublicClient } from '@/lib/supabase/public';
import { getUserDisplayName } from '@/lib/users/displayName';

export type PublicUser = {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
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
    displayName: getUserDisplayName({
      display_name:
        typeof row.display_name === 'string' ? row.display_name : null,
    }),
  };
}
