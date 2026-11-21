// Guilloche line-work, the fine interlaced pattern printed on certificates and
// banknotes to make them hard to forge. Generated from rose curves, so it's crisp
// at any size and costs a few kilobytes of SVG, not an image.
import { useMemo } from 'react';
import { cn } from '../lib/cn';

interface Ring {
  /** Base radius (0-100 in the 200x200 box). */
  radius: number;
  /** Wave height. */
  amplitude: number;
  /** Petals around the ring. */
  petals: number;
  /** Interlaced copies, each shifted by a fraction of a petal. */
  strands: number;
}

const DEFAULT_RINGS: Ring[] = [
  { radius: 86, amplitude: 9, petals: 18, strands: 6 },
  { radius: 62, amplitude: 11, petals: 12, strands: 5 },
  { radius: 38, amplitude: 9, petals: 8, strands: 4 },
  { radius: 16, amplitude: 6, petals: 5, strands: 3 },
];

function rosePath(ring: Ring, strand: number): string {
  const steps = 360;
  const phase = (strand / ring.strands) * Math.PI * 2;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rho = ring.radius + ring.amplitude * Math.sin(ring.petals * t + phase);
    const x = 100 + rho * Math.cos(t);
    const y = 100 + rho * Math.sin(t);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/** A circular rosette. Colour comes from `currentColor`, so wrap it in a text colour. */
export function GuillocheRosette({
  className,
  rings = DEFAULT_RINGS,
  strokeWidth = 0.35,
  spin = false,
}: {
  className?: string;
  rings?: Ring[];
  strokeWidth?: number;
  /** Very slow rotation; used once, on the login hero. Off under reduced motion. */
  spin?: boolean;
}) {
  const paths = useMemo(() => rings.flatMap((ring) => Array.from({ length: ring.strands }, (_, s) => rosePath(ring, s))), [rings]);
  return (
    <svg viewBox="0 0 200 200" aria-hidden className={cn('overflow-visible', className)}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        style={spin ? { transformOrigin: '100px 100px', animation: 'guilloche-turn 240s linear infinite' } : undefined}
      >
        {paths.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

/** A horizontal band of interlaced waves (crests, certificate borders). */
export function GuillocheBand({ className, strands = 7, waves = 6 }: { className?: string; strands?: number; waves?: number }) {
  const paths = useMemo(() => {
    const out: string[] = [];
    for (let s = 0; s < strands; s++) {
      const phase = (s / strands) * Math.PI * 2;
      let d = '';
      for (let i = 0; i <= 240; i++) {
        const x = (i / 240) * 400;
        const y = 20 + 12 * Math.sin((i / 240) * Math.PI * 2 * waves + phase) * Math.cos((i / 240) * Math.PI * 3 + phase / 2);
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(2)}`;
      }
      out.push(d);
    }
    return out;
  }, [strands, waves]);
  return (
    <svg viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={0.6}>
        {paths.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
