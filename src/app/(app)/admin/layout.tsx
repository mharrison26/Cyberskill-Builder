import type { Metadata } from 'next';

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

  return <>{children}</>;
}
