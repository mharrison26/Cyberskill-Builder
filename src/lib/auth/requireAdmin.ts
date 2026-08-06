import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

export type AdminProfile = {
  id: string;
  tenant_id: string;
  email: string;
  is_admin: boolean;
};

export type AdminContext = {
  authUser: User;
  profile: AdminProfile;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function requireAdmin(
  supabase?: SupabaseServerClient
): Promise<AdminContext> {
  const client = supabase ?? (await createClient());

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  const { data: profile } = await client
    .from('users')
    .select('id, tenant_id, email, is_admin')
    .eq('id', user.id)
    .single();

  if (!profile || profile.is_admin !== true) {
    redirect('/dashboard');
  }

  return {
    authUser: user,
    profile,
  };
}
