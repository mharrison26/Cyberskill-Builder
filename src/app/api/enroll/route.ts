import { NextResponse } from 'next/server';

import {
  countActiveEnrollments,
  createEnrollment,
  getActiveEnrollmentForTrack,
} from '@/lib/enrollment/createEnrollment';
import { MAX_ACTIVE_TRACK_ENROLLMENTS } from '@/lib/enrollment/pricing';
import { createClient } from '@/lib/supabase/server';

type EnrollRequestBody = {
  trackSlug?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: EnrollRequestBody;
  try {
    body = (await request.json()) as EnrollRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const trackSlug = body.trackSlug?.trim();
  if (!trackSlug) {
    return NextResponse.json(
      { error: 'trackSlug is required' },
      { status: 400 }
    );
  }

  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id, tenant_id, email')
    .eq('id', authUser.id)
    .maybeSingle();

  if (userError || !appUser) {
    return NextResponse.json(
      { error: 'User profile not found' },
      { status: 403 }
    );
  }

  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, slug, name, full_price')
    .eq('slug', trackSlug)
    .maybeSingle();

  if (trackError || !track) {
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  const existingEnrollment = await getActiveEnrollmentForTrack(
    supabase,
    appUser.id,
    track.id
  );

  if (existingEnrollment) {
    return NextResponse.json(
      { error: 'You are already enrolled in this track.' },
      { status: 409 }
    );
  }

  const activeEnrollmentCount = await countActiveEnrollments(
    supabase,
    appUser.id
  );

  if (activeEnrollmentCount >= MAX_ACTIVE_TRACK_ENROLLMENTS) {
    return NextResponse.json(
      { error: 'You already have 2 active tracks.' },
      { status: 409 }
    );
  }

  const result = await createEnrollment({
    supabase,
    studentId: appUser.id,
    tenantId: appUser.tenant_id,
    track,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      enrollment: result.enrollment,
      quote: result.quote,
    },
    { status: 201 }
  );
}
