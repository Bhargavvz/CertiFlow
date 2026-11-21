// Display components: Avatar, StatStrip/StatCard, PageHeader, Breadcrumb, LiveIndicator.
import type { Role } from '@certiflow/shared';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toneClasses, type Tone } from '../design/status';
import { cn } from '../lib/cn';
import { Skeleton } from './Feedback';
import { usePublishCrumbs, type Crumb } from './shell/crumbs';

export type { Crumb };

const roleBg: Record<Role, string> = {
  CENTRE: 'bg-role-centre',
  DISTRICT_OFFICER: 'bg-role-district',
  QUALITY: 'bg-role-quality',
  STATE: 'bg-role-state',
};

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export function Avatar({ name, role, size = 'md', className }: { name: string; role: Role; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-display font-semibold text-white',
        roleBg[role],
        size === 'sm' && 'size-6 text-[0.625rem]',
        size === 'md' && 'size-8 text-caption',
        size === 'lg' && 'size-11 text-[0.9375rem]',
        size === 'xl' && 'size-14 text-lg',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export interface Stat {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  to?: string;
}

/**
 * A row of figures in one ruled band, like the summary box on an official form.
 * One surface with dividers reads as "one set of numbers" better than N floating cards.
 */
export function StatStrip({ stats, loading, className }: { stats: Stat[]; loading?: boolean; className?: string }) {
  return (
    <section
      aria-label="Summary"
      className={cn(
        'grid overflow-hidden rounded-lg border border-border bg-surface',
        stats.length >= 5 ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5' : stats.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3',
        className,
      )}
    >
      {stats.map((s) => {
        const inner = (
          <>
            <span className="flex items-center gap-1.5 text-caption font-medium text-muted">
              {s.icon && (
                <span className={cn('grid size-5 place-items-center rounded', s.tone ? toneClasses[s.tone].badge : 'bg-primary-soft text-primary-soft-fg')}>
                  <s.icon className="size-3" aria-hidden />
                </span>
              )}
              {s.label}
            </span>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-14" />
            ) : (
              <span className="mt-1.5 block font-display text-[1.875rem] font-semibold leading-none tracking-tight text-fg tabular">{s.value}</span>
            )}
            {s.hint && <span className="mt-2 block text-caption text-muted">{s.hint}</span>}
          </>
        );
        const cls = 'relative -mb-px -mr-px border-b border-r border-border px-5 py-4';
        return s.to ? (
          <Link key={s.label} to={s.to} className={cn(cls, 'transition-colors hover:bg-surface-2/60')}>
            {inner}
          </Link>
        ) : (
          <div key={s.label} className={cls}>
            {inner}
          </div>
        );
      })}
    </section>
  );
}

/** A single figure, for places where one number stands alone. */
export function StatCard(props: Stat & { loading?: boolean }) {
  return <StatStrip stats={[props]} loading={props.loading} className="grid-cols-1 sm:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1" />;
}

export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex min-w-0 items-center gap-1 text-caption text-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              <li className={cn('flex min-w-0 items-center gap-1', last ? 'font-medium text-fg' : 'hidden shrink-0 sm:flex')}>
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-subtle" aria-hidden />}
                {c.to && !last ? (
                  <Link to={c.to} className="rounded hover:text-fg hover:underline underline-offset-4">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className="truncate">
                    {c.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Page title block. The breadcrumb is published to the top bar; the page itself
 * opens with a large, left-aligned title in the display face.
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  usePublishCrumbs(breadcrumb);
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-title text-fg">{title}</h1>
        {description && <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Websocket state: Live / Reconnecting… */
export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption font-medium text-muted" role="status" aria-live="polite">
      <span
        aria-hidden
        className={cn('size-2 rounded-full', connected ? 'bg-status-green-dot animate-[live-pulse_2.4s_ease-out_infinite]' : 'bg-status-amber-dot animate-pulse')}
      />
      <span className="sr-only sm:not-sr-only">{connected ? 'Live' : 'Reconnecting…'}</span>
    </span>
  );
}
