// Small display components: Avatar, StatCard, PageHeader, Breadcrumb, LiveIndicator.
import type { Role } from '@certiflow/shared';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toneClasses, type Tone } from '../design/status';
import { cn } from '../lib/cn';
import { Skeleton } from './Feedback';

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

export function Avatar({ name, role, size = 'md', className }: { name: string; role: Role; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-white ring-2 ring-surface',
        roleBg[role],
        size === 'sm' ? 'size-6 text-[0.625rem]' : size === 'lg' ? 'size-12 text-base' : 'size-8 text-caption',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  loading,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium text-muted">{label}</span>
        {Icon && (
          <span className={cn('grid size-8 place-items-center rounded-md', tone ? toneClasses[tone].badge : 'bg-primary-soft text-primary-soft-fg')}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <div className="mt-1 text-[1.75rem] leading-9 font-semibold tracking-tight text-fg tabular">{value}</div>}
      {hint && <div className="mt-1 text-caption text-muted">{hint}</div>}
    </>
  );
  const cls = 'block rounded-lg border border-border bg-surface p-4 shadow-sm';
  return to ? (
    <Link to={to} className={cn(cls, 'transition-colors hover:border-border-strong hover:bg-surface-2/40')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-caption text-muted">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-subtle" aria-hidden />}
            {c.to && i < items.length - 1 ? (
              <Link to={c.to} className="rounded hover:text-fg hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined} className={i === items.length - 1 ? 'text-fg' : undefined}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

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
  return (
    <header className="mb-6">
      {breadcrumb && (
        <div className="mb-2">
          <Breadcrumb items={breadcrumb} />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title text-fg">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-body text-muted">{description}</p>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Websocket state: Live / Reconnecting… */
export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border p-1.5 text-caption font-medium sm:px-2 sm:py-0.5',
        connected ? 'border-status-green-dot/30 text-status-green-fg' : 'border-status-amber-dot/40 text-status-amber-fg',
      )}
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden
        className={cn('size-2 rounded-full', connected ? 'bg-status-green-dot animate-[live-pulse_2s_ease-out_infinite]' : 'bg-status-amber-dot animate-pulse')}
      />
      {/* Dot-only on phones to save space; the text stays for screen readers. */}
      <span className="sr-only sm:not-sr-only">{connected ? 'Live' : 'Reconnecting…'}</span>
    </span>
  );
}
