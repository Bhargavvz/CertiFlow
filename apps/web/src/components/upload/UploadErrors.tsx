// The spreadsheet error report (Moment 1): every problem, grouped by row, with the
// exact cell value, plus a CSV of the same list so the centre can fix their sheet.
import { AlertTriangle, Download, FileWarning } from 'lucide-react';
import { useMemo } from 'react';
import { plural } from '../../format';
import type { RowError } from '../../types';
import { downloadCsv } from '../DataTable';
import { Button } from '../ui/button';

export function summariseErrors(errors: RowError[]) {
  const rows = new Set(errors.filter((e) => e.row > 1).map((e) => e.row));
  const structural = errors.filter((e) => e.row <= 1 || e.column === '(file)');
  return { rowCount: rows.size, problemCount: errors.length, structural: structural.length > 0 };
}

export function UploadErrors({ errors, totalRows, fileName }: { errors: RowError[]; totalRows: number; fileName?: string }) {
  const { rowCount, problemCount, structural } = summariseErrors(errors);

  const groups = useMemo(() => {
    const m = new Map<number, RowError[]>();
    for (const e of errors) m.set(e.row, [...(m.get(e.row) ?? []), e]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [errors]);

  const headline = structural
    ? 'The file’s columns need fixing first'
    : `${plural(rowCount, 'row')} ${rowCount === 1 ? 'has' : 'have'} ${plural(problemCount, 'problem')}`;

  return (
    <section aria-labelledby="upload-errors-title" className="overflow-hidden rounded-xl border border-status-red-dot/40 bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-status-red-bg/70 px-5 py-4">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-status-red-fg" aria-hidden />
          <div>
            <h3 id="upload-errors-title" className="font-semibold text-status-red-fg" role="alert">
              {headline}. Nothing was saved.
            </h3>
            <p className="mt-0.5 text-caption text-status-red-fg/90">
              {fileName ? `${fileName}: ` : ''}
              {structural
                ? 'Check the header row matches the template, then upload again.'
                : `${plural(totalRows, 'row')} checked. Fix the cells below in your spreadsheet and upload the whole file again.`}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            downloadCsv(
              'certiflow-upload-errors.csv',
              ['row', 'column', 'value', 'problem'],
              errors.map((e) => [e.row, e.column, e.value, e.message]),
            )
          }
        >
          <Download aria-hidden /> Download errors (CSV)
        </Button>
      </div>

      <div className="relative max-h-[28rem] overflow-y-auto">
        <table className="w-full text-body">
          <caption className="sr-only">Problems found in the uploaded spreadsheet, by row</caption>
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="text-left text-caption text-muted">
              <th scope="col" className="w-20 px-5 py-2 font-semibold">Row</th>
              <th scope="col" className="w-36 px-3 py-2 font-semibold">Column</th>
              <th scope="col" className="w-48 px-3 py-2 font-semibold">Value</th>
              <th scope="col" className="px-3 py-2 font-semibold">Problem</th>
            </tr>
          </thead>
          {groups.map(([row, list]) => (
            <tbody key={row} className="border-t border-border">
              {list.map((e, i) => (
                <tr key={`${row}-${e.column}-${i}`} className="align-top">
                  {i === 0 && (
                    <th scope="rowgroup" rowSpan={list.length} className="px-5 py-2.5 text-left font-semibold text-fg tabular">
                      {row <= 1 ? (
                        <span className="inline-flex items-center gap-1">
                          <FileWarning className="size-3.5 text-status-red-fg" aria-hidden /> Header
                        </span>
                      ) : (
                        row
                      )}
                    </th>
                  )}
                  <td className="px-3 py-2.5">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-caption text-fg">{e.column}</code>
                  </td>
                  <td className="px-3 py-2.5">
                    {e.value ? (
                      <span className="break-all font-mono text-caption text-fg">{e.value}</span>
                    ) : (
                      <span className="text-caption italic text-muted">(empty)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-fg">{e.message}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
