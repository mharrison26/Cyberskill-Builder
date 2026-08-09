import type { SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceOption = {
  tenantId: string;
  name: string;
  tenantKind: string;
  role: string;
  isActive: boolean;
};

/**
 * Workspaces the signed-in user can switch into (tenant memberships).
 */
export async function getUserWorkspaces(
  supabase: SupabaseClient,
  userId: string,
  activeTenantId: string | null
): Promise<WorkspaceOption[]> {
  const { data: memberships, error } = await supabase
    .from('tenant_memberships')
    .select('tenant_id, role, tenants ( id, name, tenant_kind )')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[getUserWorkspaces]', error.message);
    return [];
  }

  return (memberships ?? [])
    .map((row) => {
      const tenant = row.tenants as
        | { id: string; name: string; tenant_kind: string }
        | { id: string; name: string; tenant_kind: string }[]
        | null;
      const resolved = Array.isArray(tenant) ? tenant[0] : tenant;
      if (!resolved?.id) return null;
      return {
        tenantId: resolved.id,
        name: resolved.name,
        tenantKind: resolved.tenant_kind,
        role: (row.role as string) ?? 'member',
        isActive: resolved.id === activeTenantId,
      } satisfies WorkspaceOption;
    })
    .filter((row): row is WorkspaceOption => Boolean(row));
}
