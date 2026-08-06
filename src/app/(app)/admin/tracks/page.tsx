import type { Metadata } from 'next';

import { CreateTrackForm } from '@/app/(app)/admin/tracks/CreateTrackForm';
import { UpdateTrackPriceForm } from '@/app/(app)/admin/tracks/UpdateTrackPriceForm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Tracks — Admin',
  description: 'Manage learning tracks',
};

export default async function AdminTracksPage() {
  const supabase = await createClient();

  const { data: tracks, error } = await supabase
    .from('tracks')
    .select('id, slug, name, full_price')
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load tracks: ${error.message}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tracks</h1>
        <p className="mt-1 text-muted-foreground">
          Create tracks and update catalog pricing.
        </p>
      </header>

      <CreateTrackForm />

      {tracks && tracks.length > 0 ? (
        <div className="rounded-lg border border-border">
          <Table>
            <caption className="sr-only">All learning tracks</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Full price</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Edit price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tracks.map((track) => (
                <TableRow key={track.id}>
                  <TableCell className="font-mono">{track.slug}</TableCell>
                  <TableCell>{track.name}</TableCell>
                  <TableCell>${Number(track.full_price).toFixed(2)}</TableCell>
                  <TableCell className="max-w-[12rem] truncate font-mono text-xs text-muted-foreground">
                    {track.id}
                  </TableCell>
                  <TableCell>
                    <UpdateTrackPriceForm
                      trackId={track.id}
                      trackName={track.name}
                      fullPrice={Number(track.full_price)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No tracks yet. Add one above.
        </p>
      )}
    </div>
  );
}
