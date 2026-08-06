'use client';

import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { MOCK_GRADING_QUEUE } from '@/lib/mock-data';
import type { MockGradingQueueItem } from '@/types';

const columns: DataTableColumn<MockGradingQueueItem>[] = [
  { key: 'studentName', header: 'Student', sortable: true },
  { key: 'lessonTitle', header: 'Lesson', sortable: true },
  { key: 'trackName', header: 'Track', sortable: true },
  {
    key: 'aiFindingState',
    header: 'AI Finding',
    sortable: true,
    render: (row) => <StatusBadge status={row.aiFindingState} />,
  },
  {
    key: 'reviewed',
    header: 'Reviewed',
    sortable: true,
    render: (row) => (
      <span
        className={
          row.reviewed
            ? 'text-status-satisfied-foreground'
            : 'text-status-insufficient-foreground'
        }
      >
        {row.reviewed ? 'Yes' : 'Pending'}
      </span>
    ),
  },
];

export function AdminGradingTable() {
  return (
    <DataTable
      data={MOCK_GRADING_QUEUE}
      columns={columns}
      searchKeys={['studentName', 'studentEmail', 'lessonTitle', 'trackName']}
      searchPlaceholder="Search by student or lesson…"
      expandable
      renderExpanded={(row) => (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-muted-foreground">Email</dt>
            <dd>{row.studentEmail}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">AI assessment</dt>
            <dd className="mt-1">
              <StatusBadge status={row.aiFindingState} />
            </dd>
          </div>
        </dl>
      )}
    />
  );
}
