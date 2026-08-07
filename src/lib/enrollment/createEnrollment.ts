import type { SupabaseClient } from '@supabase/supabase-js';

import { mapEnrollmentError } from '@/lib/enrollment/mapEnrollmentError';
import {
  computeEnrollmentQuote,
  type EnrollmentQuote,
} from '@/lib/enrollment/pricing';

export type TrackForEnrollment = {
  id: string;
  slug: string;
  name: string;
  full_price: number;
};

export type StripeEnrollmentMetadata = {
  customerId: string | null;
  checkoutSessionId: string;
};

export type CreatedEnrollment = {
  id: string;
  tenant_id: string;
  student_id: string;
  track_id: string;
  status: string;
  is_discounted: boolean;
  price_paid: number;
  purchased_at: string;
  stripe_customer_id: string | null;
  stripe_checkout_session_id: string | null;
};

export type CreateEnrollmentSuccess = {
  ok: true;
  enrollment: CreatedEnrollment;
  quote: EnrollmentQuote;
};

export type CreateEnrollmentFailure = {
  ok: false;
  error: string;
  status: number;
};

export type CreateEnrollmentResult =
  CreateEnrollmentSuccess | CreateEnrollmentFailure;

export async function countActiveEnrollments(
  supabase: SupabaseClient,
  studentId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('track_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('status', 'active');

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function getActiveEnrollmentForTrack(
  supabase: SupabaseClient,
  studentId: string,
  trackId: string
): Promise<CreatedEnrollment | null> {
  const { data, error } = await supabase
    .from('track_enrollments')
    .select(
      'id, tenant_id, student_id, track_id, status, is_discounted, price_paid, purchased_at, stripe_customer_id, stripe_checkout_session_id'
    )
    .eq('student_id', studentId)
    .eq('track_id', trackId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getEnrollmentByCheckoutSessionId(
  supabase: SupabaseClient,
  checkoutSessionId: string
): Promise<CreatedEnrollment | null> {
  const { data, error } = await supabase
    .from('track_enrollments')
    .select(
      'id, tenant_id, student_id, track_id, status, is_discounted, price_paid, purchased_at, stripe_customer_id, stripe_checkout_session_id'
    )
    .eq('stripe_checkout_session_id', checkoutSessionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function quoteEnrollment(
  supabase: SupabaseClient,
  studentId: string,
  track: TrackForEnrollment
): Promise<EnrollmentQuote> {
  const activeEnrollmentCount = await countActiveEnrollments(
    supabase,
    studentId
  );

  return computeEnrollmentQuote(
    Number(track.full_price),
    activeEnrollmentCount
  );
}

export async function createEnrollment(input: {
  supabase: SupabaseClient;
  studentId: string;
  tenantId: string;
  track: TrackForEnrollment;
  stripe?: StripeEnrollmentMetadata;
}): Promise<CreateEnrollmentResult> {
  const { supabase, studentId, tenantId, track, stripe } = input;

  if (stripe?.checkoutSessionId) {
    const existingBySession = await getEnrollmentByCheckoutSessionId(
      supabase,
      stripe.checkoutSessionId
    );

    if (existingBySession) {
      return {
        ok: true,
        enrollment: existingBySession,
        quote: computeEnrollmentQuote(
          Number(track.full_price),
          existingBySession.is_discounted ? 1 : 0
        ),
      };
    }
  }

  const existingEnrollment = await getActiveEnrollmentForTrack(
    supabase,
    studentId,
    track.id
  );

  if (existingEnrollment) {
    return {
      ok: false,
      error: 'You are already enrolled in this track.',
      status: 409,
    };
  }

  const quote = await quoteEnrollment(supabase, studentId, track);

  const { data: enrollment, error: insertError } = await supabase
    .from('track_enrollments')
    .insert({
      tenant_id: tenantId,
      student_id: studentId,
      track_id: track.id,
      status: 'active',
      is_discounted: quote.isDiscounted,
      price_paid: quote.pricePaid,
      stripe_customer_id: stripe?.customerId ?? null,
      stripe_checkout_session_id: stripe?.checkoutSessionId ?? null,
    })
    .select(
      'id, tenant_id, student_id, track_id, status, is_discounted, price_paid, purchased_at, stripe_customer_id, stripe_checkout_session_id'
    )
    .single();

  if (insertError) {
    const mapped = mapEnrollmentError(insertError);
    return {
      ok: false,
      error: mapped.message,
      status: mapped.status,
    };
  }

  return {
    ok: true,
    enrollment,
    quote,
  };
}
