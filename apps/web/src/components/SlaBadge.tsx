import { AlarmClock, CheckCircle2, Siren } from 'lucide-react';
import { toneClasses } from '../design/status';
import { cn } from '../lib/cn';
import { slaState } from '../lib/workflow';
import { useNow } from './RelativeTime';

/** Green → amber → red SLA indicator with a live countdown ("Breaches in 5h"). */
export function SlaBadge({
  enteredAt,
  slaSeconds,
  breachedAt,
  className,
}: {
  enteredAt: string | null;
  slaSeconds: number | undefined;
  breachedAt: string | null;
  className?: string;
}) {
  const now = useNow();
  if (!slaSeconds) return null;
  const s = slaState(enteredAt, slaSeconds, breachedAt, now);
  if (!s) return null;
  const Icon = s.tone === 'red' ? Siren : s.tone === 'amber' ? AlarmClock : CheckCircle2;
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium', toneClasses[s.tone].badge, className)}
      title={enteredAt ? `SLA: ${Math.round(slaSeconds / 3600) || '<1'}h per step` : undefined}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">SLA: </span>
      {s.label}
    </span>
  );
}
