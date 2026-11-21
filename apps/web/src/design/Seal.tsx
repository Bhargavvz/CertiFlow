// The ink seal: a guilloche rosette inside a lettered ring, pressed onto a result.
// Lettering on a seal is a seal convention, so it is the one place we set caps.
import { Check, HelpCircle, X } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { GuillocheRosette } from './Guilloche';

type SealTone = 'valid' | 'revoked' | 'neutral' | 'ink';

const toneClass: Record<SealTone, string> = {
  valid: 'text-status-green-dot',
  revoked: 'text-status-red-dot',
  neutral: 'text-status-slate-dot',
  ink: 'text-primary',
};

export function Seal({
  tone,
  label,
  size = 132,
  press = false,
  onDark = false,
  className,
}: {
  tone: SealTone;
  /** Text around the ring, e.g. "VERIFIED ✦ PRAGATI SKILLS MISSION ✦". */
  label: string;
  size?: number;
  /** Play the one-time "pressed on" animation. */
  press?: boolean;
  /** Seal printed in light ink on a dark ground: the centre mark switches to dark ink. */
  onDark?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const Icon = tone === 'valid' || tone === 'ink' ? Check : tone === 'revoked' ? X : HelpCircle;
  return (
    <div
      aria-hidden
      className={cn('relative shrink-0', toneClass[tone], className)}
      style={{ width: size, height: size, transform: 'rotate(-8deg)', animation: press ? 'seal-press 520ms cubic-bezier(.2,.9,.3,1.2) both' : undefined }}
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full">
        <defs>
          <path id={`ring-${id}`} d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0" />
        </defs>
        <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="100" cy="100" r="64" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <text fill="currentColor" fontSize="13.5" fontWeight="700" style={{ fontFamily: 'var(--font-display)' }}>
          {/* textLength = the ring's circumference (2π·78), so any label wraps the full circle evenly. */}
          <textPath href={`#ring-${id}`} startOffset="0" textLength="486" lengthAdjust="spacing">
            {label}
          </textPath>
        </text>
      </svg>
      <GuillocheRosette
        className="absolute inset-[22%] opacity-60"
        rings={[
          { radius: 80, amplitude: 14, petals: 12, strands: 5 },
          { radius: 44, amplitude: 12, petals: 7, strands: 4 },
        ]}
        strokeWidth={0.6}
      />
      <span className="absolute inset-[38%] grid place-items-center rounded-full bg-current">
        <Icon className={cn('size-[60%]', onDark ? 'text-ink' : 'text-white dark:text-surface')} strokeWidth={3} />
      </span>
    </div>
  );
}
