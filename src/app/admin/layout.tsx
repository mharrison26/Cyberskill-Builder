import type { Metadata } from 'next';

import { Header } from '@/components/Header';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Administration',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-gray-50 font-[family-name:var(--font-geist-sans)]">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-12">{children}</main>
    </div>
  );
}
