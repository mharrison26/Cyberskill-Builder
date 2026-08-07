-- Stripe identifiers for paid enrollments (set by webhook after checkout.session.completed).

ALTER TABLE public.track_enrollments
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

COMMENT ON COLUMN public.track_enrollments.stripe_customer_id IS
  'Stripe Customer id from Checkout (cus_...).';

COMMENT ON COLUMN public.track_enrollments.stripe_checkout_session_id IS
  'Stripe Checkout Session id (cs_...) used to create this enrollment.';

CREATE UNIQUE INDEX IF NOT EXISTS track_enrollments_stripe_checkout_session_id_idx
  ON public.track_enrollments (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
