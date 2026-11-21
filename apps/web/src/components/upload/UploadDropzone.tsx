// Drag-and-drop (or click / keyboard) file picker for the candidate spreadsheet.
// Checks type and size up front for quick feedback; the server re-checks everything.
import { FileSpreadsheet, Loader2, UploadCloud, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '../../format';
import { cn } from '../../lib/cn';

const ACCEPT = /\.(csv|xlsx)$/i;

export function UploadDropzone({
  maxBytes,
  busy,
  file,
  onFile,
  onClear,
}: {
  maxBytes: number;
  busy?: boolean;
  file: File | null;
  onFile: (f: File) => void;
  onClear?: () => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const accept = (f: File | undefined) => {
    if (!f) return;
    if (!ACCEPT.test(f.name)) return setProblem(`“${f.name}” isn’t a .csv or .xlsx file.`);
    if (f.size > maxBytes) return setProblem(`“${f.name}” is ${formatBytes(f.size)}. The limit is ${formatBytes(maxBytes)}.`);
    if (f.size === 0) return setProblem(`“${f.name}” is empty.`);
    setProblem(null);
    onFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!busy) accept(e.dataTransfer.files?.[0]);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          over ? 'border-primary bg-primary-soft/60' : 'border-border-strong bg-surface-2/40 hover:border-primary/60',
          busy && 'pointer-events-none opacity-70',
        )}
      >
        {file ? (
          <div className="flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left shadow-sm">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-status-green-bg text-status-green-fg">
              {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-5" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-fg">{file.name}</span>
              <span className="block text-caption text-muted">
                {formatBytes(file.size)}, {busy ? 'checking every row…' : 'ready'}
              </span>
            </span>
            {!busy && onClear && (
              <button type="button" onClick={onClear} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Remove file">
                <X className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <>
            <span className="mb-3 grid size-12 place-items-center rounded-full bg-primary-soft text-primary-soft-fg">
              <UploadCloud className="size-6" aria-hidden />
            </span>
            <p className="font-medium text-fg">Drag your spreadsheet here</p>
            <p className="mt-1 text-caption text-muted">CSV or Excel (.xlsx), up to {formatBytes(maxBytes)}</p>
            <label
              htmlFor={id}
              className="mt-4 inline-flex h-9 cursor-pointer items-center rounded-md border border-border-strong bg-surface px-4 text-body font-medium text-fg shadow-sm transition-colors hover:bg-surface-2 focus-within:outline-2 focus-within:outline-ring"
            >
              Choose a file
            </label>
          </>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = ''; // allow re-choosing the same file after fixing it
          }}
        />
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-caption text-status-red-fg">
          {problem}
        </p>
      )}
    </div>
  );
}
