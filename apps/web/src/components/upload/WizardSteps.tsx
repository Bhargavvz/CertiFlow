import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export const WIZARD_STEPS = ['Batch details', 'Upload candidates', 'Review & submit'] as const;

/** Numbered step header for the create-batch wizard. `current` is 0-based. */
export function WizardSteps({ current }: { current: number }) {
  return (
    <ol className="mb-6 grid grid-cols-3 gap-2" aria-label={`Step ${current + 1} of ${WIZARD_STEPS.length}: ${WIZARD_STEPS[current]}`}>
      {WIZARD_STEPS.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={label} aria-current={state === 'current' ? 'step' : undefined} className="flex flex-col gap-2">
            <span className={cn('h-1 rounded-full', state === 'todo' ? 'bg-border' : 'bg-primary')} aria-hidden />
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold',
                  state === 'done' && 'bg-primary text-primary-fg',
                  state === 'current' && 'border-2 border-primary text-primary',
                  state === 'todo' && 'border border-border-strong text-muted',
                )}
              >
                {state === 'done' ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              <span className={cn('truncate text-caption font-medium', state === 'todo' ? 'text-muted' : 'text-fg')}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
