import type { Metadata } from 'next';

import { AdminLessonsTable } from '@/components/admin/AdminLessonsTable';

export const metadata: Metadata = {
  title: 'Admin — Lessons',
  description: 'Manage training lessons.',
};

export default function AdminLessonsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Lessons</h1>
        <p className="mt-1 text-muted-foreground">
          Lesson catalog across all training tracks. Mock data — no backend
          connected.
        </p>
      </header>

      <AdminLessonsTable />
    </div>
  );
}
