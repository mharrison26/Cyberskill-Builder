import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { EnrollButton } from '@/components/checkout/EnrollButton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { countActiveEnrollments } from '@/lib/enrollment/createEnrollment';
import {
  computeEnrollmentQuote,
  ENROLLMENT_DISCOUNT_RATE,
  formatTrackPrice,
  MAX_ACTIVE_TRACK_ENROLLMENTS,
} from '@/lib/enrollment/pricing';
import { getTrackDescription } from '@/lib/enrollment/trackDescriptions';
import { createClient } from '@/lib/supabase/server';

type CheckoutPageProps = {
  params: { trackSlug: string };
};

export async function generateMetadata({
  params,
}: CheckoutPageProps): Promise<Metadata> {
  const supabase = await createClient();
  const { data: track } = await supabase
    .from('tracks')
    .select('name')
    .eq('slug', params.trackSlug)
    .maybeSingle();

  return {
    title: track ? `Checkout — ${track.name}` : 'Checkout',
    description: 'Complete enrollment to access track content',
  };
}

export default async function TrackCheckoutPage({ params }: CheckoutPageProps) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect(
      `/sign-in?redirectTo=${encodeURIComponent(`/checkout/${params.trackSlug}`)}`
    );
  }

  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, slug, name, full_price')
    .eq('slug', params.trackSlug)
    .maybeSingle();

  if (trackError || !track) {
    notFound();
  }

  const { data: appUser, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle();

  if (userError || !appUser) {
    redirect('/sign-in');
  }

  const { data: existingEnrollment } = await supabase
    .from('track_enrollments')
    .select('id')
    .eq('student_id', appUser.id)
    .eq('track_id', track.id)
    .eq('status', 'active')
    .maybeSingle();

  if (existingEnrollment) {
    redirect('/dashboard');
  }

  const activeEnrollmentCount = await countActiveEnrollments(
    supabase,
    appUser.id
  );
  const atEnrollmentLimit =
    activeEnrollmentCount >= MAX_ACTIVE_TRACK_ENROLLMENTS;
  const quote = computeEnrollmentQuote(
    Number(track.full_price),
    activeEnrollmentCount
  );
  const fullPrice = Number(track.full_price);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Enroll in {track.name}</h1>
        <p className="mt-1 text-muted-foreground">
          Complete payment to unlock lessons and portfolio artifacts.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{track.name}</CardTitle>
          <CardDescription className="leading-relaxed">
            {getTrackDescription(track.slug, track.name)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-baseline justify-between gap-4 border-t border-border pt-4">
            <span className="text-sm font-medium text-muted-foreground">
              {quote.isDiscounted ? 'Discounted price' : 'Full price'}
            </span>
            <div className="text-right">
              <p className="text-2xl font-semibold text-primary">
                {formatTrackPrice(quote.pricePaid)}
              </p>
              {quote.isDiscounted ? (
                <p className="text-sm text-muted-foreground line-through">
                  {formatTrackPrice(fullPrice)}
                </p>
              ) : null}
            </div>
          </div>

          {quote.isDiscounted && !atEnrollmentLimit ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              You already have an active track enrollment. Your second track is{' '}
              {Math.round(ENROLLMENT_DISCOUNT_RATE * 100)}% off full price.
            </p>
          ) : null}

          {atEnrollmentLimit ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              You already have {MAX_ACTIVE_TRACK_ENROLLMENTS} active tracks.
              Complete or cancel an enrollment before adding another.
            </p>
          ) : null}

          <EnrollButton
            trackSlug={track.slug}
            disabled={atEnrollmentLimit}
            label={atEnrollmentLimit ? 'Enrollment limit reached' : 'Enroll'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
