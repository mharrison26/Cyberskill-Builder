'use client';

import { useCallback, useRef } from 'react';

import { DataTable, type DataTableColumn } from '@/components/DataTable';
import type { ControlCatalogEntry } from '@/lib/oscal/parseCatalog';

type ControlCatalogBrowserProps = {
  controls: ControlCatalogEntry[];
};

const columns: DataTableColumn<ControlCatalogEntry>[] = [
  {
    key: 'control_id',
    header: 'Control ID',
    sortable: true,
    className: 'w-32 font-mono text-sm',
  },
  {
    key: 'family',
    header: 'Family',
    sortable: true,
    className: 'w-48',
  },
  {
    key: 'title',
    header: 'Title',
    sortable: true,
  },
];

export function ControlCatalogBrowser({
  controls,
}: ControlCatalogBrowserProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      const focusedRow = (event.target as HTMLElement).closest(
        'tr[tabindex="0"]'
      );
      if (!focusedRow || !tableContainerRef.current) return;

      const rows = Array.from(
        tableContainerRef.current.querySelectorAll<HTMLTableRowElement>(
          'tbody tr[tabindex="0"]'
        )
      );
      const currentIndex = rows.indexOf(focusedRow as HTMLTableRowElement);
      if (currentIndex === -1) return;

      const nextIndex =
        event.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
      if (nextIndex < 0 || nextIndex >= rows.length) return;

      event.preventDefault();
      rows[nextIndex].focus();
    },
    []
  );

  return (
    <div ref={tableContainerRef} onKeyDown={handleKeyDown}>
      <DataTable
        data={controls}
        columns={columns}
        searchKeys={['control_id', 'title', 'family']}
        searchPlaceholder="Search by control ID, title, or family…"
        expandable
        emptyMessage="No controls match your search."
        renderExpanded={(row) => (
          <div className="space-y-2">
            <h3 className="font-mono text-sm font-medium">{row.control_id}</h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {row.statement || 'No statement text available.'}
            </p>
          </div>
        )}
      />
    </div>
  );
}
