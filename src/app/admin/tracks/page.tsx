import type { Metadata } from 'next';

import { CreateTrackForm } from '@/app/admin/tracks/CreateTrackForm';
import { UpdateTrackPriceForm } from '@/app/admin/tracks/UpdateTrackPriceForm';
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
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Tracks</h1>
      <p className="mt-2 text-sm text-gray-600">
        Create tracks and update catalog pricing.
      </p>

      <div className="mt-8">
        <CreateTrackForm />
      </div>

      {tracks && tracks.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <caption className="sr-only">All learning tracks</caption>
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-gray-700"
                >
                  Slug
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-gray-700"
                >
                  Name
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-gray-700"
                >
                  Full price
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-gray-700"
                >
                  ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-gray-700"
                >
                  Edit price
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tracks.map((track) => (
                <tr key={track.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-gray-900">
                    {track.slug}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-900">
                    {track.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-900">
                    ${Number(track.full_price).toFixed(2)}
                  </td>
                  <td className="max-w-[12rem] truncate px-4 py-3 font-mono text-xs text-gray-500">
                    {track.id}
                  </td>
                  <td className="px-4 py-3">
                    <UpdateTrackPriceForm
                      trackId={track.id}
                      trackName={track.name}
                      fullPrice={Number(track.full_price)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 text-sm text-gray-600">
          No tracks yet. Add one above.
        </p>
      )}
    </div>
  );
}
