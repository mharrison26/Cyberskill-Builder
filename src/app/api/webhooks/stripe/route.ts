import { NextResponse } from 'next/server';
import type Stripe from 'stripe';

import {
  createEnrollment,
  getEnrollmentByCheckoutSessionId,
} from '@/lib/enrollment/createEnrollment';
import { getStripeClient } from '@/lib/stripe/client';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function metadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<NextResponse> {
  const checkoutSessionId = session.id;
  const userId = metadataValue(session.metadata, 'user_id');
  const tenantId = metadataValue(session.metadata, 'tenant_id');
  const trackId = metadataValue(session.metadata, 'track_id');
  const trackSlug = metadataValue(session.metadata, 'track_slug');

  if (!userId || !tenantId || !trackId || !trackSlug) {
    console.error('Stripe webhook missing enrollment metadata', {
      checkoutSessionId,
      metadata: session.metadata,
    });
    return NextResponse.json(
      { error: 'Missing enrollment metadata' },
      { status: 400 }
    );
  }

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ received: true, skipped: 'unpaid' });
  }

  const supabase = createAdminClient();

  const existingEnrollment = await getEnrollmentByCheckoutSessionId(
    supabase,
    checkoutSessionId
  );

  if (existingEnrollment) {
    return NextResponse.json({
      received: true,
      enrollmentId: existingEnrollment.id,
    });
  }

  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, slug, name, full_price')
    .eq('id', trackId)
    .maybeSingle();

  if (trackError || !track) {
    console.error('Stripe webhook track lookup failed', {
      checkoutSessionId,
      trackId,
      trackError,
    });
    return NextResponse.json({ error: 'Track not found' }, { status: 404 });
  }

  const customerId =
    typeof session.customer === 'string'
      ? session.customer
      : (session.customer?.id ?? null);

  const result = await createEnrollment({
    supabase,
    studentId: userId,
    tenantId,
    track,
    stripe: {
      customerId,
      checkoutSessionId,
    },
  });

  if (!result.ok) {
    console.error('Stripe webhook enrollment failed', {
      checkoutSessionId,
      error: result.error,
      status: result.status,
    });
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json({
    received: true,
    enrollmentId: result.enrollment.id,
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET is not configured' },
      { status: 503 }
    );
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Stripe is not configured';
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid webhook signature';
    console.error('Stripe webhook signature verification failed:', message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(
        event.data.object as Stripe.Checkout.Session
      );
    default:
      return NextResponse.json({ received: true });
  }
}
