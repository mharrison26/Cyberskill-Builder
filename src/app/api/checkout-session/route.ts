import { NextResponse } from 'next/server';

import {
  countActiveEnrollments,
  getActiveEnrollmentForTrack,
  quoteEnrollment,
} from '@/lib/enrollment/createEnrollment';
import {
  MAX_ACTIVE_TRACK_ENROLLMENTS,
  toStripeUnitAmount,
} from '@/lib/enrollment/pricing';
import { getStripeClient } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';

type CheckoutSessionRequestBody = {
  trackSlug?: string;
};

function resolveAppOrigin(request: Request): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const origin = request.headers.get('origin');
  if (origin) {
    return origin.replace(/\/$/, '');
  }

  const host = request.headers.get('host');
  if (host) {
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  return 'http://localhost:3000';
}

export async function POST(request: Request) {
  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Stripe is not configured';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const supabase = await createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CheckoutSessionRequestBody;
  try {
    body = (await request.json()) as CheckoutSessionRequestBody;
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

  const quote = await quoteEnrollment(supabase, appUser.id, track);
  const origin = resolveAppOrigin(request);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: appUser.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: toStripeUnitAmount(quote.pricePaid),
            product_data: {
              name: track.name,
              description: `${track.name} track enrollment`,
            },
          },
        },
      ],
      metadata: {
        user_id: appUser.id,
        tenant_id: appUser.tenant_id,
        track_id: track.id,
        track_slug: track.slug,
        is_discounted: quote.isDiscounted ? 'true' : 'false',
      },
      success_url: `${origin}/dashboard?checkout=success&track=${encodeURIComponent(track.slug)}`,
      cancel_url: `${origin}/checkout/${encodeURIComponent(track.slug)}`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout session creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
