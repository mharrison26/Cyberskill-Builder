'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import {
  normalizeDisplayName,
  validateDisplayName,
} from '@/lib/users/displayName';

export type UpdateDisplayNameResult = {
  error?: string;
  success?: boolean;
  displayName?: string;
};

export async function updateDisplayName(
  formData: FormData
): Promise<UpdateDisplayNameResult> {
  const raw = String(formData.get('displayName') ?? '');
  const validationError = validateDisplayName(raw);
  if (validationError) return { error: validationError };

  const displayName = normalizeDisplayName(raw);
  if (!displayName) return { error: 'Preferred name is required' };

  const supabase = await createClient();
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { error: 'You must be signed in to update your preferred name.' };
  }

  // Verify the row actually updated — RLS 0-row updates return no error.
  const { data: updated, error: updateError } = await supabase
    .from('users')
    .update({ display_name: displayName })
    .eq('id', authUser.id)
    .select('display_name')
    .maybeSingle();

  if (updateError) return { error: updateError.message };

  if (!updated || normalizeDisplayName(updated.display_name) !== displayName) {
    return {
      error:
        'Could not save your preferred name. Check that your account is fully set up, then try again.',
    };
  }

  revalidatePath('/', 'layout');
  revalidatePath('/account');
  revalidatePath('/dashboard');
  revalidatePath('/portfolio');

  return { success: true, displayName };
}
