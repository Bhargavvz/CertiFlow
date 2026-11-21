// Client-side table: search, sort, paginate and export what you see as CSV.
// Lists here are scoped server-side and capped (≤ 200 rows), so client-side is enough.
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn';
import { ErrorState, Skeleton } from './Feedback';
import { Button } from './ui/button';
import { Input } from './ui/form';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Included in the search box match. */
  searchText?: (row: T) => string;
  /** Included in CSV export. */
  csv?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** Hide on narrow screens to keep the table readable. */
  hideBelow?: 'sm' | 'md' | 'lg';
  /** Exported to CSV but not shown (e.g. a value already shown inside another cell). */
  csvOnly?: boolean;
  className?: string;
}

type SortDir = 'asc' | 'desc';

export interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  getRowId: (row: T) => string;
  /** Accessible name for the table. */
  caption: string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  rowHref?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  searchPlaceholder?: string;
  /** Extra filter controls shown next to the search box. */
  toolbar?: ReactNode;
  /** Extra row filter (e.g. by a status select in `toolbar`). */
  filter?: (row: T) => boolean;
  initialSort?: { id: string; dir: SortDir };
  pageSize?: number;
  csvFilename?: string;
  empty?: ReactNode;
  /** Shown when rows exist but search/filter hides them all. */
  noMatches?: ReactNode;
  dense?: boolean;
}

const hideCls = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;
const alignCls = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/** Prefix cells that a spreadsheet would execute as a formula (same rule as our importer). */
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }); // BOM so Excel reads UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataTable<T>(p: DataTableProps<T>) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(p.initialSort);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(p.pageSize ?? 10);

  const processed = useMemo(() => {
    let out = p.rows ?? [];
    if (p.filter) out = out.filter(p.filter);
    const q = query.trim().toLowerCase();
    if (q) {
      const searchable = p.columns.filter((c) => c.searchText);
      out = out.filter((r) => searchable.some((c) => c.searchText!(r).toLowerCase().includes(q)));
    }
    if (sort) {
      const col = p.columns.find((c) => c.id === sort.id);
      if (col?.sortValue) {
        const dir = sort.dir === 'asc' ? 1 : -1;
        out = [...out].sort((a, b) => {
          const va = col.sortValue!(a);
          const vb = col.sortValue!(b);
          if (va === vb) return 0;
          if (va === null || va === undefined) return 1; // blanks last
          if (vb === null || vb === undefined) return -1;
          return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
        });
      }
    }
    return out;
  }, [p.rows, p.filter, p.columns, query, sort]);

  const pages = Math.max(1, Math.ceil(processed.length / size));
  const current = Math.min(page, pages - 1);
  const visible = processed.slice(current * size, current * size + size);
  const shown = p.columns.filter((c) => !c.csvOnly);
  const hasSearch = p.columns.some((c) => c.searchText);
  const csvCols = p.columns.filter((c) => c.csv);

  const toggleSort = (id: string) => {
    setPage(0);
    setSort((s) => (s?.id !== id ? { id, dir: 'asc' } : s.dir === 'asc' ? { id, dir: 'desc' } : undefined));
  };

  if (p.error) return <ErrorState error={p.error} onRetry={p.onRetry} />;

  return (
    <div className="flex flex-col gap-3">
      {(hasSearch || p.toolbar || (p.csvFilename && csvCols.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2">
          {hasSearch && (
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={p.searchPlaceholder ?? 'Search…'}
                aria-label={p.searchPlaceholder ?? `Search ${p.caption}`}
                className="pl-8"
              />
            </div>
          )}
          {p.toolbar}
          {p.csvFilename && csvCols.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              disabled={processed.length === 0}
              onClick={() =>
                downloadCsv(
                  p.csvFilename!,
                  csvCols.map((c) => c.header),
                  processed.map((r) => csvCols.map((c) => c.csv!(r))),
                )
              }
            >
              <Download aria-hidden /> Export CSV
            </Button>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
        <table className="w-full border-collapse text-body">
          <caption className="sr-only">{p.caption}</caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/70">
              {shown.map((c) => {
                const active = sort?.id === c.id;
                const SortIcon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : c.sortValue ? 'none' : undefined}
                    className={cn(
                      'whitespace-nowrap px-4 py-2.5 text-caption font-semibold text-muted',
                      alignCls[c.align ?? 'left'],
                      c.hideBelow && hideCls[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn('inline-flex items-center gap-1 rounded hover:text-fg', active && 'text-fg')}
                      >
                        {c.header}
                        <SortIcon className={cn('size-3.5', !active && 'opacity-40')} aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {p.loading &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {shown.map((c) => (
                    <td key={c.id} className={cn('px-4 py-3', c.hideBelow && hideCls[c.hideBelow])}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))}
            {!p.loading &&
              visible.map((row) => {
                const href = p.rowHref?.(row);
                return (
                  <tr
                    key={p.getRowId(row)}
                    onClick={
                      href
                        ? (e) => {
                            // Let real links/buttons inside the row do their own thing.
                            if ((e.target as HTMLElement).closest('a,button,input,label')) return;
                            navigate(href);
                          }
                        : undefined
                    }
                    className={cn(
                      'border-b border-border transition-colors last:border-0',
                      href && 'cursor-pointer hover:bg-surface-2/60',
                      p.rowClassName?.(row),
                    )}
                  >
                    {shown.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          p.dense ? 'px-4 py-2' : 'px-4 py-3',
                          'align-middle',
                          alignCls[c.align ?? 'left'],
                          c.hideBelow && hideCls[c.hideBelow],
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
        {!p.loading && processed.length === 0 && (
          <div className="border-t border-border">
            {(p.rows?.length ?? 0) > 0
              ? (p.noMatches ?? <p className="px-4 py-10 text-center text-body text-muted">Nothing matches your search or filters.</p>)
              : (p.empty ?? <p className="px-4 py-10 text-center text-body text-muted">Nothing here yet.</p>)}
          </div>
        )}
      </div>

      {!p.loading && processed.length > Math.min(size, 10) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
          <span aria-live="polite">
            Showing <span className="tabular text-fg">{current * size + 1}</span>–
            <span className="tabular text-fg">{Math.min(processed.length, current * size + size)}</span> of{' '}
            <span className="tabular text-fg">{processed.length}</span>
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              Rows
              <select
                value={size}
                onChange={(e) => {
                  setSize(Number(e.target.value));
                  setPage(0);
                }}
                className="h-8 rounded-md border border-border-strong bg-surface px-2 text-caption text-fg"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" size="icon-sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="tabular">
              {current + 1} / {pages}
            </span>
            <Button variant="secondary" size="icon-sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
