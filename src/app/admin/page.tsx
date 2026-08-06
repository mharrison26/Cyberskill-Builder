import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Admin dashboard',
};

export default function AdminPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
      <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">Admin dashboard</h2>
        <p className="mt-2 text-sm text-gray-600">
          Protected admin area. Manage users, tracks, and settings from here.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link
              href="/admin/tracks"
              className="font-medium text-gray-900 underline underline-offset-2 hover:text-gray-700"
            >
              Tracks
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
