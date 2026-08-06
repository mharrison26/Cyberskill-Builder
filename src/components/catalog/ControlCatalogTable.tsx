'use client';

import { DataTable, type DataTableColumn } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { MOCK_CONTROLS } from '@/lib/mock-data';
import type { MockControl } from '@/types';

const columns: DataTableColumn<MockControl>[] = [
  {
    key: 'id',
    header: 'Control ID',
    sortable: true,
    className: 'font-mono text-sm w-28',
  },
  {
    key: 'family',
    header: 'Family',
    sortable: true,
  },
  {
    key: 'title',
    header: 'Title',
    sortable: true,
  },
];

export function ControlCatalogTable() {
  return (
    <DataTable
      data={MOCK_CONTROLS}
      columns={columns}
      searchKeys={['id', 'family', 'title', 'statement']}
      searchPlaceholder="Search controls by ID, family, or title…"
      expandable
      renderExpanded={(row) => (
        <div className="space-y-2">
          <h3 className="font-mono text-sm font-medium">{row.id}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {row.statement}
          </p>
          <div className="pt-2">
            <StatusBadge status="not_started" />
            <span className="ml-2 text-xs text-muted-foreground">
              Assessment not started
            </span>
          </div>
        </div>
      )}
    />
  );
}
