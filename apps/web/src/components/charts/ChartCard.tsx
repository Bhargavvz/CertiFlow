// Chart container: title, a "View as table" toggle (every chart has an accessible
// table equivalent), and theme-aware colours read from the design tokens.
import { BarChart3, Table2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTheme } from '../../design/theme';
import { Card, CardBody, CardHeader } from '../ui/card';

/** Resolve CSS custom properties to concrete colours for SVG (re-read when the theme flips). */
export function useChartColors() {
  const { resolved } = useTheme();
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    return {
      mark: v('--primary'),
      markMuted: v('--border-strong'),
      grid: v('--border'),
      axis: v('--muted'),
      surface: v('--surface'),
    };
    // `resolved` is the trigger: the CSS variables change when the theme class flips.
  }, [resolved]);
}

export function ChartCard({
  title,
  description,
  chart,
  table,
  className,
}: {
  title: string;
  description?: string;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        description={description}
        actions={
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption font-medium text-muted hover:bg-surface-2 hover:text-fg"
          >
            {asTable ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        }
      />
      <CardBody>{asTable ? table : chart}</CardBody>
    </Card>
  );
}

/** Minimal table used as every chart's accessible alternative. */
export function SimpleTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="relative max-h-72 overflow-auto rounded-md border border-border">
      <table className="w-full text-body">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={`px-3 py-2 text-caption font-semibold text-muted ${i > 0 ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-1.5 ${j > 0 ? 'text-right tabular' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tooltip body in the app's style (Recharts passes active/payload/label). */
export function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { value?: number | string }[]; label?: string | number; format: (label: string, value: number) => ReactNode }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-caption shadow-md">{format(String(label ?? ''), Number(payload[0]?.value ?? 0))}</div>
  );
}
