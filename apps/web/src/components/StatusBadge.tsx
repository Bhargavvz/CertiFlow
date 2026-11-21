import type { ReactNode } from 'react';
import type { BatchStatus } from '@certiflow/shared';
import { batchStatus, certificateStatus, deliveryStatus, toneClasses, verifyResult, type DeliveryStatus, type StatusStyle } from '../design/status';
import { cn } from '../lib/cn';

type Props =
  | { kind: 'batch'; status: BatchStatus }
  | { kind: 'delivery'; status: DeliveryStatus }
  | { kind: 'certificate'; status: 'ISSUED' | 'REVOKED' }
  | { kind: 'verify'; status: 'VALID' | 'REVOKED' | 'NOT_FOUND' };

export function statusStyle(p: Props): StatusStyle {
  switch (p.kind) {
    case 'batch':
      return batchStatus[p.status];
    case 'delivery':
      return deliveryStatus[p.status];
    case 'certificate':
      return certificateStatus[p.status];
    case 'verify':
      return verifyResult[p.status];
  }
}

/** Tinted pill with icon + text. Colour is never the only signal. */
export function StatusBadge(props: Props & { size?: 'sm' | 'md'; className?: string; label?: string }) {
  const s = statusStyle(props);
  const Icon = s.icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap',
        props.size === 'sm' ? 'px-2 py-0.5 text-[0.6875rem] leading-4' : 'px-2.5 py-0.5 text-caption',
        toneClasses[s.tone].badge,
        props.className,
      )}
    >
      <Icon className={cn(props.size === 'sm' ? 'size-3' : 'size-3.5', s.spin && 'animate-spin [animation-duration:2s]')} aria-hidden />
      {props.label ?? s.label}
    </span>
  );
}

/** Plain tone pill for things that are not a status (e.g. "SLA breached", "You approved"). */
export function Pill({ tone, children, className }: { tone: keyof typeof toneClasses; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium whitespace-nowrap [&_svg]:size-3.5', toneClasses[tone].badge, className)}>
      {children}
    </span>
  );
}
