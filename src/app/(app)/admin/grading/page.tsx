import type { Metadata } from 'next';

import { AdminGradingTable } from '@/components/admin/AdminGradingTable';

export const metadata: Metadata = {
  title: 'Admin — Grading Queue',
  description: 'Review student lesson submissions.',
};

export default function AdminGradingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Grading Queue</h1>
        <p className="mt-1 text-muted-foreground">
          Student submissions awaiting assessor review. AI finding states are
          preliminary.
        </p>
      </header>

      <AdminGradingTable />
    </div>
  );
}
