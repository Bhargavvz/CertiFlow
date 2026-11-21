// "58 of 60 delivered, 2 retrying": one stacked bar per batch, updated live.
import { toneClasses } from '../../design/status';
import { plural } from '../../format';
import { cn } from '../../lib/cn';
import type { DeliveryStatusCode } from '../../types';

const SEGMENTS: { key: DeliveryStatusCode | 'RETRYING'; label: string; tone: keyof typeof toneClasses }[] = [
  { key: 'DELIVERED', label: 'delivered', tone: 'green' },
  { key: 'SENT', label: 'sent', tone: 'blue' },
  { key: 'RETRYING', label: 'retrying', tone: 'amber' },
  { key: 'PENDING', label: 'queued', tone: 'slate' },
  { key: 'DEAD', label: 'failed', tone: 'red' },
];

export function DeliveryProgress({
  total,
  counts,
  compact,
}: {
  /** Candidates in the batch (certificates still being generated count as not started). */
  total: number;
  counts: { DELIVERED: number; SENT: number; RETRYING: number; PENDING: number; DEAD: number };
  compact?: boolean;
}) {
  const parts = SEGMENTS.map((s) => ({ ...s, n: counts[s.key] })).filter((s) => s.n > 0);
  const known = parts.reduce((a, p) => a + p.n, 0);
  const notStarted = Math.max(0, total - known);
  const summary = [`${counts.DELIVERED} of ${total} delivered`, ...parts.filter((p) => p.key !== 'DELIVERED').map((p) => `${p.n} ${p.label}`)];
  if (notStarted > 0) summary.push(`${notStarted} being generated`);

  return (
    <div>
      <div
        className={cn('flex w-full overflow-hidden rounded-full bg-surface-2', compact ? 'h-1.5' : 'h-2.5')}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={counts.DELIVERED}
        aria-valuetext={summary.join(', ')}
      >
        {parts.map((p) => (
          <span key={p.key} className={cn('h-full transition-[width] duration-500', toneClasses[p.tone].bar)} style={{ width: `${(p.n / Math.max(total, 1)) * 100}%` }} />
        ))}
      </div>
      {!compact && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted" aria-hidden>
          <span className="font-medium text-fg">{summary[0]}</span>
          {parts
            .filter((p) => p.key !== 'DELIVERED')
            .map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1">
                <span className={cn('size-2 rounded-full', toneClasses[p.tone].dot)} />
                {plural(p.n, p.label, p.label)}
              </span>
            ))}
          {notStarted > 0 && <span>{notStarted} being generated</span>}
        </p>
      )}
    </div>
  );
}

/** Map the API's raw delivery status counts to the progress segments. */
export function progressCounts(c: Record<DeliveryStatusCode, number>) {
  return { DELIVERED: c.DELIVERED, SENT: c.SENT, RETRYING: c.FAILED, PENDING: c.PENDING, DEAD: c.DEAD };
}
