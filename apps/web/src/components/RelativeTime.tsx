import { formatDistanceToNowStrict } from 'date-fns';
import { useEffect, useState } from 'react';
import { formatDateTime } from '../format';

// One shared 30-second ticker so a table with 200 timestamps doesn't start 200 timers.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 30_000);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(() => setNow(Date.now())), []);
  return now;
}

export function relative(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Math.abs(now - d.getTime()) < 45_000) return 'just now';
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

/** "3 hours ago", with the exact IST date on hover and for screen readers. */
export function RelativeTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  useNow();
  if (!iso) return <span className={className}>-</span>;
  const full = formatDateTime(iso);
  return (
    <time dateTime={iso} title={full} className={className}>
      {relative(iso)}
      <span className="sr-only"> ({full})</span>
    </time>
  );
}
