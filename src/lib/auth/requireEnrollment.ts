import type { SupabaseClient, User } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';

export type Track = {
  id: string;
  slug: string;
  name: string;
  full_price: number;
};

export type AppUser = {
  id: string;
  tenant_id: string;
  email: string;
};

export type TrackEnrollment = {
  id: string;
  tenant_id: string;
  student_id: string;
  track_id: string;
  status: string;
  is_discounted: boolean;
  price_paid: number;
  purchased_at: string;
};

export type RequireEnrollmentResult = {
  authUser: User;
  user: AppUser;
  track: Track;
  enrollment: TrackEnrollment;
};

function signInRedirect(returnTo?: string): never {
  const signInUrl = returnTo
    ? `/sign-in?redirectTo=${encodeURIComponent(returnTo)}`
    : '/sign-in';
  redirect(signInUrl);
}

export async function requireEnrollment(
  supabase: SupabaseClient,
  trackSlug: string,
  returnTo?: string
): Promise<RequireEnrollmentResult> {
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    signInRedirect(returnTo);
  }

  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, slug, name, full_price')
    .eq('slug', trackSlug)
    .maybeSingle();

  if (trackError || !track) {
    notFound();
  }

  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, email')
    .eq('id', authUser.id)
    .maybeSingle();

  if (userError || !appUser) {
    redirect(`/checkout/${trackSlug}`);
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('track_enrollments')
    .select(
      'id, tenant_id, student_id, track_id, status, is_discounted, price_paid, purchased_at'
    )
    .eq('student_id', appUser.id)
    .eq('track_id', track.id)
    .eq('status', 'active')
    .maybeSingle();

  if (enrollmentError || !enrollment) {
    redirect(`/checkout/${trackSlug}`);
  }

  return {
    authUser,
    user: appUser,
    track,
    enrollment,
  };
}
