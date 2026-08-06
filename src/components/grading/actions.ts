'use server';

import { revalidatePath } from 'next/cache';

import { portfolioSlug } from '@/lib/users/portfolioSlug';
import { createClient } from '@/lib/supabase/server';

export type ToggleFindingPublicResult = {
  error?: string;
};

export async function toggleFindingPublic(
  findingId: string,
  isPublic: boolean
): Promise<ToggleFindingPublicResult> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { error: 'You must be signed in to update this finding.' };
  }

  const { data: finding, error: fetchError } = await supabase
    .from('oscal_findings')
    .select('id, student_id, lesson_id, track_id')
    .eq('id', findingId)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError.message };
  }

  if (!finding || finding.student_id !== authUser.id) {
    return { error: 'Finding not found.' };
  }

  const { error: updateError } = await supabase
    .from('oscal_findings')
    .update({ is_public: isPublic })
    .eq('id', findingId)
    .eq('student_id', authUser.id);

  if (updateError) {
    return { error: updateError.message };
  }

  const [{ data: track }, { data: appUser }] = await Promise.all([
    supabase
      .from('tracks')
      .select('slug')
      .eq('id', finding.track_id)
      .maybeSingle(),
    supabase
      .from('users')
      .select('username, email')
      .eq('id', authUser.id)
      .maybeSingle(),
  ]);

  if (track?.slug) {
    revalidatePath(`/tracks/${track.slug}/lessons/${finding.lesson_id}`);
  }

  if (appUser) {
    revalidatePath(`/portfolio/${portfolioSlug(appUser)}`);
  }

  return {};
}
