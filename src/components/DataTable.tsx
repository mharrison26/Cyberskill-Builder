'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type DataTableColumn<T> = {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
};

type SortDirection = 'asc' | 'desc';

type DataTableProps<T extends { id: string }> = {
  data: T[];
  columns: DataTableColumn<T>[];
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  expandable?: boolean;
  renderExpanded?: (row: T) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
};

export function DataTable<T extends { id: string }>({
  data,
  columns,
  searchPlaceholder = 'Search…',
  searchKeys = [],
  expandable = false,
  renderExpanded,
  emptyMessage = 'No results found.',
  className,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data;
    return data.filter((row) =>
      searchKeys.some((key) =>
        String(row[key] ?? '')
          .toLowerCase()
          .includes(query)
      )
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = String((a as Record<string, unknown>)[sortKey] ?? '');
      const bVal = String((b as Record<string, unknown>)[sortKey] ?? '');
      const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDirection]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  }

  function handleRowKeyDown(
    event: React.KeyboardEvent<HTMLTableRowElement>,
    rowId: string
  ) {
    if (!expandable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setExpandedId((prev) => (prev === rowId ? null : rowId));
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          aria-label={searchPlaceholder}
        />
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {expandable ? (
                <TableHead className="w-10" scope="col">
                  <span className="sr-only">Expand</span>
                </TableHead>
              ) : null}
              {columns.map((col) => (
                <TableHead
                  key={String(col.key)}
                  scope="col"
                  className={col.className}
                  aria-sort={
                    col.sortable
                      ? sortKey === col.key
                        ? sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(String(col.key))}
                      className="inline-flex items-center gap-1 font-medium hover:text-primary focus:outline-none focus-visible:underline"
                    >
                      {col.header}
                      {sortKey === col.key ? (
                        <span aria-hidden="true">
                          {sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (expandable ? 1 : 0)}
                  className="py-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => {
                const isExpanded = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      tabIndex={expandable ? 0 : undefined}
                      onKeyDown={(e) => handleRowKeyDown(e, row.id)}
                      onClick={
                        expandable
                          ? () =>
                              setExpandedId((prev) =>
                                prev === row.id ? null : row.id
                              )
                          : undefined
                      }
                      className={cn(
                        expandable && 'cursor-pointer hover:bg-muted/50'
                      )}
                      aria-expanded={expandable ? isExpanded : undefined}
                    >
                      {expandable ? (
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown
                              className="size-4"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="size-4"
                              aria-hidden="true"
                            />
                          )}
                        </TableCell>
                      ) : null}
                      {columns.map((col) => (
                        <TableCell
                          key={String(col.key)}
                          className={col.className}
                        >
                          {col.render
                            ? col.render(row)
                            : String(
                                (row as Record<string, unknown>)[
                                  col.key as string
                                ] ?? ''
                              )}
                        </TableCell>
                      ))}
                    </TableRow>
                    {expandable && isExpanded && renderExpanded ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length + 1}
                          className="bg-muted/30 p-4"
                        >
                          {renderExpanded(row)}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
