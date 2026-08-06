import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Header } from '@/components/Header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your dashboard',
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-in');
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[family-name:var(--font-geist-sans)]">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Signed in as{' '}
          <span className="font-medium text-gray-900">{user.email}</span>
        </p>
      </main>
    </div>
  );
}
