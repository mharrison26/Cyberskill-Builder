import type { Metadata } from 'next';
import Link from 'next/link';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatTrackPrice } from '@/lib/enrollment/pricing';
import { getTrackDescription } from '@/lib/enrollment/trackDescriptions';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Choose a training track to enroll',
};

export default async function CheckoutIndexPage() {
  const supabase = await createClient();
  const { data: tracks, error } = await supabase
    .from('tracks')
    .select('slug, name, full_price')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load tracks: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Choose a track</h1>
        <p className="mt-1 text-muted-foreground">
          Select a training track to review pricing and enroll.
        </p>
      </header>

      {tracks && tracks.length > 0 ? (
        <div className="grid gap-4">
          {tracks.map((track) => (
            <Link
              key={track.slug}
              href={`/checkout/${track.slug}`}
              className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="transition-colors hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="text-base">{track.name}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {getTrackDescription(track.slug, track.name)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm font-medium text-primary">
                    From {formatTrackPrice(Number(track.full_price))} →
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No tracks available</CardTitle>
            <CardDescription>
              Training tracks have not been published yet. Check back later or
              contact your administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
