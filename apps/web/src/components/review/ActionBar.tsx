import { CheckCircle2, Info, RotateCcw, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AuthUser, BatchDetail } from '../../types';
import { Button, type ButtonProps } from '../ui/button';
import { Tooltip } from '../ui/overlays';
import { reviewActions } from './reviewActions';

export type ReviewAction = 'approve' | 'send_back' | 'reject';

/** A button that explains itself when disabled (tooltip + screen-reader text). */
function ExplainedButton({ enabled, reason, children, ...props }: ButtonProps & { enabled: boolean; reason?: string; children: ReactNode }) {
  if (enabled) return <Button {...props}>{children}</Button>;
  return (
    <Tooltip content={reason}>
      {/* A disabled button can't receive focus or hover, so the wrapper carries the tooltip. */}
      <span
        tabIndex={0}
        role="button"
        aria-disabled="true"
        className="inline-flex rounded-md"
        aria-label={`${String(props['aria-label'] ?? '')} (unavailable${reason ? `: ${reason}` : ''})`}
      >
        <Button {...props} disabled aria-hidden className={`pointer-events-none ${props.className ?? ''}`}>
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}

export function ActionBar({ detail, user, busy, onAction }: { detail: BatchDetail; user: AuthUser; busy: boolean; onAction: (a: ReviewAction) => void }) {
  const a = reviewActions(detail, user);
  if (!a.visible) return null;
  return (
    <div className="flex flex-col gap-3">
      {a.note && (
        <p className="flex gap-2 text-caption text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          {a.note}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <ExplainedButton
          enabled={a.approve.enabled}
          reason={a.approve.reason}
          variant="success"
          size="lg"
          className="w-full"
          loading={busy}
          aria-label={a.approve.label}
          onClick={() => onAction('approve')}
        >
          <CheckCircle2 aria-hidden /> {a.approve.label}
        </ExplainedButton>
        <div className="grid grid-cols-2 gap-2">
          <ExplainedButton enabled={a.sendBack.enabled} reason={a.sendBack.reason} variant="secondary" aria-label="Send back" onClick={() => onAction('send_back')} className="w-full">
            <RotateCcw aria-hidden /> Send back
          </ExplainedButton>
          <ExplainedButton enabled={a.reject.enabled} reason={a.reject.reason} variant="danger-outline" aria-label="Reject" onClick={() => onAction('reject')} className="w-full">
            <XCircle aria-hidden /> Reject
          </ExplainedButton>
        </div>
      </div>
    </div>
  );
}
