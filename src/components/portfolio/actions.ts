'use server';

import { revalidatePath } from 'next/cache';

import { portfolioSlug } from '@/lib/users/portfolioSlug';
import { createClient } from '@/lib/supabase/server';

export type TogglePortfolioPublicResult = {
  error?: string;
};

export async function togglePortfolioItemPublic(
  itemId: string,
  isPublic: boolean
): Promise<TogglePortfolioPublicResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { error: 'You must be signed in to update this artifact.' };
  }

  const { data: item, error: fetchError } = await supabase
    .from('portfolio_items')
    .select('id, student_id')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!item || item.student_id !== authUser.id) {
    return { error: 'Portfolio item not found.' };
  }

  const { error: updateError } = await supabase
    .from('portfolio_items')
    .update({ is_public: isPublic })
    .eq('id', itemId)
    .eq('student_id', authUser.id);

  if (updateError) return { error: updateError.message };

  const { data: appUser } = await supabase
    .from('users')
    .select('username, email')
    .eq('id', authUser.id)
    .maybeSingle();

  revalidatePath('/portfolio');
  if (appUser) {
    revalidatePath(`/portfolio/${portfolioSlug(appUser)}`);
  }

  return {};
}

export async function toggleDefensePublic(
  defenseId: string,
  isPublic: boolean
): Promise<TogglePortfolioPublicResult> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { error: 'You must be signed in to update this defense.' };
  }

  const { error: updateError } = await supabase
    .from('defense_recordings')
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', defenseId)
    .eq('student_id', authUser.id);

  if (updateError) return { error: updateError.message };

  revalidatePath('/portfolio');
  return {};
}
