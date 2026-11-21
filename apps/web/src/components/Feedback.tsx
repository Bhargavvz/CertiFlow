// Loading, empty and error states. Every screen uses these so the three states
// look and read the same everywhere.
import { AlertOctagon, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError, friendlyMessage } from '../api';
import { cn } from '../lib/cn';
import { Button } from './ui/button';
import { CopyButton } from './CopyButton';

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block animate-pulse rounded-md bg-surface-2', className)} />;
}

/** A few lines of skeleton text, announced once to screen readers. */
export function SkeletonBlock({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-3 grid size-11 place-items-center rounded-lg bg-primary-soft text-primary-soft-fg">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-section text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-body text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const ref = error instanceof ApiError ? error.correlationId : undefined;
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-status-red-bg text-status-red-fg">
        <AlertOctagon className="size-5" aria-hidden />
      </span>
      <p className="text-section text-fg">Couldn't load this</p>
      <p className="mt-1 max-w-md text-body text-muted">{friendlyMessage(error)}</p>
      {ref && (
        <p className="mt-2 inline-flex items-center gap-1 text-caption text-muted">
          Ref <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">{ref.slice(0, 13)}</code>
          <CopyButton value={ref} label="Copy reference" />
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}
