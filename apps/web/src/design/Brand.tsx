import { cn } from '../lib/cn';
import { GuillocheRosette } from './Guilloche';

/** The CertiFlow mark: a small guilloche rosette, as on the corner of a certificate. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('relative grid size-9 shrink-0 place-items-center rounded-[10px] bg-current/10 ring-1 ring-current/20', className)} aria-hidden>
      <GuillocheRosette
        className="size-7"
        rings={[
          { radius: 84, amplitude: 13, petals: 10, strands: 4 },
          { radius: 46, amplitude: 11, petals: 6, strands: 3 },
        ]}
        strokeWidth={0.9}
      />
    </span>
  );
}

/** Mark + wordmark. `tone="ink"` for the dark rail, `tone="paper"` on light surfaces. */
export function Brand({ tone = 'paper', compact, subtitle = 'Pragati Skills Mission', className }: { tone?: 'ink' | 'paper'; compact?: boolean; subtitle?: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', tone === 'ink' ? 'text-ink-fg' : 'text-primary', className)}>
      <BrandMark />
      {!compact && (
        <span className="leading-tight">
          <span className={cn('block font-display text-[1.0625rem] font-semibold tracking-tight', tone === 'ink' ? 'text-ink-fg' : 'text-fg')}>CertiFlow</span>
          <span className={cn('block text-micro', tone === 'ink' ? 'text-ink-muted' : 'text-muted')}>{subtitle}</span>
        </span>
      )}
    </span>
  );
}
