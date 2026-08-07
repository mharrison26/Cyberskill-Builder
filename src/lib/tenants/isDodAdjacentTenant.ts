import type { SupabaseClient } from '@supabase/supabase-js';

export const DOD_ADJACENT_TENANT_KIND = 'dod_adjacent';

export async function isDodAdjacentTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<boolean> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('tenant_kind')
    .eq('id', tenantId)
    .maybeSingle();

  if (error || !tenant) {
    return false;
  }

  return tenant.tenant_kind === DOD_ADJACENT_TENANT_KIND;
}
