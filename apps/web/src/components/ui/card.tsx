import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** A panel. Flat by default: hierarchy comes from spacing and rules, not stacked shadows. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-surface', className)} {...props} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pb-3 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="text-section text-fg">{title}</h2>
        {description && <p className="mt-0.5 max-w-prose text-caption text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // Under a CardHeader it continues the header's rhythm; as the first child it needs its own top padding.
  return <div className={cn('px-5 pb-5 pt-1 first:pt-5', className)} {...props} />;
}

/** Hairline divider inside a card. */
export function CardRule() {
  return <hr className="border-border" />;
}
