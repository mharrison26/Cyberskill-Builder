'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export type SwitchWorkspaceResult = {
  error?: string;
};

/**
 * Switch the user's active workspace (users.tenant_id) to a membership tenant.
 */
export async function switchWorkspace(
  tenantId: string
): Promise<SwitchWorkspaceResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { error: 'You must be signed in to switch workspace.' };
  }

  const { data: membership, error: membershipError } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', authUser.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (membershipError) return { error: membershipError.message };
  if (!membership) {
    return { error: 'You are not a member of that workspace.' };
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ tenant_id: tenantId })
    .eq('id', authUser.id);

  if (updateError) return { error: updateError.message };

  // Refresh session so the custom access token hook re-embeds tenant_id.
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    return {
      error: `Workspace updated, but session refresh failed: ${refreshError.message}. Sign out and back in.`,
    };
  }

  revalidatePath('/', 'layout');
  return {};
}
