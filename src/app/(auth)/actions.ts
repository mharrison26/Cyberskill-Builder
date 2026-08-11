'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  captureUserSignedIn,
  captureUserSignedUp,
} from '@/lib/analytics/capture';
import { createClient } from '@/lib/supabase/server';
import { validateEmail, validatePassword } from '@/lib/auth/validation';

export type AuthActionResult = {
  error?: string;
  message?: string;
};

export async function signIn(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError };

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error: error.message };

  if (data.user?.id) {
    void captureUserSignedIn(data.user.id, { via: 'password' });
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signUp(formData: FormData): Promise<AuthActionResult> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const cohortCode = String(formData.get('cohortCode') ?? '').trim();
  const displayName = String(formData.get('displayName') ?? '').trim();

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError };

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const metadata: Record<string, string> = {};
  if (cohortCode) metadata.cohort_code = cohortCode;
  // Copied into public.users.display_name by handle_new_user when present.
  if (displayName) {
    metadata.full_name = displayName;
    metadata.name = displayName;
    metadata.display_name = displayName;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: Object.keys(metadata).length > 0 ? { data: metadata } : undefined,
  });

  if (error) return { error: error.message };

  if (data.user?.id) {
    await captureUserSignedUp(data.user.id, {
      has_cohort_code: Boolean(cohortCode),
    });
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath('/', 'layout');
  redirect('/sign-in');
}
