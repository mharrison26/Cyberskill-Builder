'use client';

import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { MOCK_ADMIN_LESSONS } from '@/lib/mock-data';

type AdminLesson = (typeof MOCK_ADMIN_LESSONS)[number];

const columns: DataTableColumn<AdminLesson>[] = [
  { key: 'sortOrder', header: '#', sortable: true, className: 'w-12' },
  { key: 'title', header: 'Title', sortable: true },
  { key: 'trackName', header: 'Track', sortable: true },
  { key: 'tier', header: 'Tier', sortable: true, className: 'capitalize' },
  {
    key: 'lessonType',
    header: 'Type',
    sortable: true,
    render: (row) => row.lessonType.replace(/_/g, ' '),
  },
  {
    key: 'published',
    header: 'Published',
    render: (row) => (row.published ? 'Yes' : 'No'),
  },
];

export function AdminLessonsTable() {
  return (
    <DataTable
      data={MOCK_ADMIN_LESSONS}
      columns={columns}
      searchKeys={['title', 'trackName', 'tier', 'lessonType']}
      searchPlaceholder="Search lessons…"
    />
  );
}
