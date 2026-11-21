// The approval pipeline: Centre → District (2 officers) → Quality (large batches) → State → Issued.
// Derived only from the batch status the API returns; nothing is guessed.
import type { BatchStatus } from '@certiflow/shared';
import { Check, Minus, RotateCcw, X } from 'lucide-react';
import { cn } from '../lib/cn';

type StepKey = 'centre' | 'district' | 'quality' | 'state' | 'issued';
type StepState = 'done' | 'current' | 'upcoming' | 'skipped' | 'returned' | 'rejected' | 'warning';

interface Step {
  key: StepKey;
  label: string;
  state: StepState;
  detail?: string;
}

export interface StepProgressProps {
  status: BatchStatus;
  needsQuality: boolean;
  /** "1 of 2" while at the district step. */
  districtApprovals?: { count: number; required: number };
  /** Step at which a rejected batch was stopped, if known. */
  rejectedAt?: 'DISTRICT' | 'QUALITY' | 'STATE';
  variant?: 'full' | 'compact';
  className?: string;
}

const ORDER: StepKey[] = ['centre', 'district', 'quality', 'state', 'issued'];
const LABELS: Record<StepKey, string> = { centre: 'Centre', district: 'District', quality: 'Quality', state: 'State', issued: 'Issued' };

export function buildSteps({ status, needsQuality, districtApprovals, rejectedAt }: StepProgressProps): Step[] {
  const currentIndex: Record<BatchStatus, number> = {
    DRAFT: 0,
    SENT_BACK: 0,
    PENDING_DISTRICT: 1,
    PENDING_QUALITY: 2,
    PENDING_STATE: 3,
    APPROVED: 4,
    ISSUING: 4,
    ISSUED: 5,
    PARTIALLY_ISSUED: 4,
    REJECTED: rejectedAt === 'STATE' ? 3 : rejectedAt === 'QUALITY' ? 2 : 1,
  };
  const at = currentIndex[status];

  return ORDER.map((key, i): Step => {
    const step: Step = { key, label: LABELS[key], state: i < at ? 'done' : i === at ? 'current' : 'upcoming' };
    if (key === 'quality' && !needsQuality) return { ...step, state: 'skipped', detail: 'Not needed' };
    if (i !== at) return step;

    if (status === 'SENT_BACK') return { ...step, state: 'returned', detail: 'Sent back' };
    if (status === 'REJECTED') return { ...step, state: 'rejected', detail: 'Rejected' };
    if (status === 'PARTIALLY_ISSUED') return { ...step, state: 'warning', detail: 'Some deliveries failed' };
    if (status === 'DRAFT') return { ...step, detail: 'Preparing' };
    if (key === 'district' && districtApprovals) {
      return { ...step, detail: `${districtApprovals.count} of ${districtApprovals.required} approvals` };
    }
    if (key === 'issued') return { ...step, detail: status === 'APPROVED' ? 'Starting' : 'In progress' };
    return { ...step, detail: 'In review' };
  });
}

function summary(steps: Step[]): string {
  const current = steps.find((s) => s.state !== 'done' && s.state !== 'skipped' && s.state !== 'upcoming');
  if (!current) return 'All steps complete';
  return `${current.label}: ${current.detail ?? current.state}`;
}

const dotClass: Record<StepState, string> = {
  done: 'bg-primary text-primary-fg border-primary',
  current: 'bg-surface text-primary border-primary ring-4 ring-primary/15',
  upcoming: 'bg-surface text-subtle border-border-strong',
  skipped: 'bg-surface text-subtle border-dashed border-border-strong',
  returned: 'bg-status-orange-bg text-status-orange-fg border-status-orange-dot',
  rejected: 'bg-status-red-bg text-status-red-fg border-status-red-dot',
  warning: 'bg-status-orange-bg text-status-orange-fg border-status-orange-dot',
};

const segClass: Record<StepState, string> = {
  done: 'bg-primary',
  current: 'bg-status-amber-dot',
  upcoming: 'bg-border-strong/60',
  skipped: 'bg-border/60 bg-[repeating-linear-gradient(90deg,transparent_0_3px,var(--border-strong)_3px_5px)]',
  returned: 'bg-status-orange-dot',
  rejected: 'bg-status-red-dot',
  warning: 'bg-status-orange-dot',
};

function StepIcon({ state, index }: { state: StepState; index: number }) {
  if (state === 'done') return <Check className="size-3.5" strokeWidth={3} aria-hidden />;
  if (state === 'returned') return <RotateCcw className="size-3.5" aria-hidden />;
  if (state === 'rejected') return <X className="size-3.5" strokeWidth={3} aria-hidden />;
  if (state === 'skipped') return <Minus className="size-3.5" aria-hidden />;
  return <span className="text-[0.6875rem] font-semibold tabular">{index + 1}</span>;
}

export function StepProgress(props: StepProgressProps) {
  const steps = buildSteps(props);
  const text = summary(steps);

  if (props.variant === 'compact') {
    // Five thin segments; the full meaning is in the accessible label and tooltip text.
    const currentStatus = props.status === 'ISSUING' || props.status === 'APPROVED';
    return (
      <div className={cn('flex w-28 items-center gap-0.5', props.className)} role="img" aria-label={`Progress: ${text}`} title={text}>
        {steps.map((s) => (
          <span
            key={s.key}
            className={cn('h-1.5 flex-1 rounded-full', s.state === 'current' && currentStatus ? 'bg-status-blue-dot' : segClass[s.state])}
          />
        ))}
      </div>
    );
  }

  return (
    <ol className={cn('flex w-full items-start', props.className)} aria-label={`Approval progress. ${text}`}>
      {steps.map((s, i) => (
        <li key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                'absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2',
                steps[i - 1]!.state === 'done' && s.state !== 'upcoming' ? 'bg-primary' : 'bg-border-strong',
              )}
            />
          )}
          <span className={cn('relative z-10 grid size-7 place-items-center rounded-full border-2 transition-colors', dotClass[s.state])}>
            <StepIcon state={s.state} index={i} />
          </span>
          <span className={cn('mt-2 text-caption font-medium', s.state === 'upcoming' || s.state === 'skipped' ? 'text-muted' : 'text-fg')}>
            {s.label}
          </span>
          <span className="mt-0.5 hidden px-1 text-[0.6875rem] leading-4 text-muted sm:block">
            {s.detail ?? (s.state === 'done' ? 'Done' : s.state === 'upcoming' ? '' : '')}
          </span>
          <span className="sr-only">
            {s.state === 'done' ? 'completed' : s.state === 'upcoming' ? 'not started' : (s.detail ?? s.state)}
          </span>
        </li>
      ))}
    </ol>
  );
}
