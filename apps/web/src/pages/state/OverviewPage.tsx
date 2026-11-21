// State office overview. Every number comes from GET /state/overview (real rows).
// Charts follow the dataviz rules: one hue for magnitude (colour encodes nothing the
// axis doesn't already name), thin marks, hover tooltips, and a table view for each.
import { BATCH_STATUSES } from '@certiflow/shared';
import { format, parseISO } from 'date-fns';
import { Award, Clock3, ListChecks, ShieldX, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { ChartCard, ChartTooltip, SimpleTable, useChartColors } from '../../components/charts/ChartCard';
import { PageHeader, StatStrip } from '../../components/Display';
import { EmptyState, ErrorState, SkeletonBlock } from '../../components/Feedback';
import { DeliveryProgress } from '../../components/review/DeliveryProgress';
import { SlaBadge } from '../../components/SlaBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { Card, CardHeader } from '../../components/ui/card';
import { batchStatus, deliveryStatus, toneClasses } from '../../design/status';
import { formatDuration, formatNumber, plural } from '../../format';
import { cn } from '../../lib/cn';
import { whoHasIt } from '../../lib/workflow';
import { useMeta, useOverview, useStuck } from '../../queries';
import type { DeliveryStatusCode } from '../../types';

const DELIVERY_ORDER: DeliveryStatusCode[] = ['DELIVERED', 'SENT', 'FAILED', 'PENDING', 'DEAD'];
const STEP_LABEL = { PENDING_DISTRICT: 'District review', PENDING_QUALITY: 'Quality check', PENDING_STATE: 'Final approval' } as const;

export default function OverviewPage() {
  const overview = useOverview();
  const stuck = useStuck();
  const meta = useMeta();
  const c = useChartColors();

  if (overview.isLoading) return <SkeletonBlock lines={10} />;
  if (overview.error || !overview.data) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  const o = overview.data;

  const inReview = o.batchesByStatus.PENDING_DISTRICT + o.batchesByStatus.PENDING_QUALITY + o.batchesByStatus.PENDING_STATE;
  const statusRows = BATCH_STATUSES.filter((s) => s !== 'DRAFT').map((s) => ({ status: s, label: batchStatus[s].label, count: o.batchesByStatus[s] }));
  const perDay = o.certificatesPerDay.map((d) => ({ ...d, label: format(parseISO(d.day), 'd MMM') }));
  const issued14 = perDay.reduce((a, d) => a + d.count, 0);
  const totalDeliveries = DELIVERY_ORDER.reduce((a, k) => a + o.deliveryOutcomes[k], 0);
  const maxDelivery = Math.max(1, ...DELIVERY_ORDER.map((k) => o.deliveryOutcomes[k]));

  const axisTick = { fill: c.axis, fontSize: 12 };

  return (
    <>
      <PageHeader title="State overview" description="Across all districts: what’s moving, what’s stuck, and whether certificates reach people." breadcrumb={[{ label: 'Overview' }]} />

      <StatStrip
        stats={[
          { label: 'Waiting for your approval', value: o.batchesByStatus.PENDING_STATE, icon: ListChecks, tone: 'amber', to: '/queue', hint: `${inReview} in review across all steps` },
          { label: 'SLA breaches', value: o.slaBreached, icon: Siren, tone: o.slaBreached > 0 ? 'red' : 'green', to: '/stuck', hint: o.slaBreached ? 'Escalated to you' : 'Nothing overdue' },
          { label: 'Issued in 14 days', value: formatNumber(issued14), icon: Award, tone: 'green', hint: `${formatNumber(o.certificates.issuedThisMonth)} this month` },
          { label: 'Revoked', value: o.certificates.revoked, icon: ShieldX, to: '/certificates', hint: `${formatNumber(o.certificates.valid)} valid certificates` },
        ]}
      />

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Certificates issued per day"
          description="Last 14 days, India time."
          chart={
            issued14 === 0 ? (
              <EmptyState title="No certificates issued in the last 14 days" className="py-8" />
            ) : (
              <div className="h-56" role="img" aria-label={`Bar chart: ${issued14} certificates issued over the last 14 days. Use “View as table” for exact numbers.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perDay} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap={2}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: c.grid }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={44} />
                    <RTooltip
                      cursor={{ fill: c.grid, opacity: 0.5 }}
                      content={<ChartTooltip format={(l, v) => <><span className="font-medium text-fg">{plural(v, 'certificate')}</span> <span className="text-muted">on {l}</span></>} />}
                    />
                    <Bar dataKey="count" fill={c.mark} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          }
          table={<SimpleTable caption="Certificates issued per day" head={['Day', 'Certificates']} rows={perDay.map((d) => [d.day, d.count])} />}
        />

        <ChartCard
          title="Batches by status"
          description="Submitted batches (drafts stay private to centres)."
          chart={
            <div className="h-56" role="img" aria-label="Bar chart of batches by status. Use “View as table” for exact numbers.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusRows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }} barCategoryGap={4}>
                  <CartesianGrid horizontal={false} stroke={c.grid} />
                  <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={112} />
                  <RTooltip
                    cursor={{ fill: c.grid, opacity: 0.5 }}
                    content={<ChartTooltip format={(l, v) => <><span className="font-medium text-fg">{plural(v, 'batch', 'batches')}</span> <span className="text-muted">{l.toLowerCase()}</span></>} />}
                  />
                  <Bar dataKey="count" fill={c.mark} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          }
          table={<SimpleTable caption="Batches by status" head={['Status', 'Batches']} rows={statusRows.map((r) => [r.label, r.count])} />}
        />

        <Card>
          <CardHeader title="WhatsApp delivery outcomes" description={`${formatNumber(totalDeliveries)} deliveries across all batches.`} actions={<Link to="/deliveries" className="text-caption font-medium text-primary hover:underline">Deliveries</Link>} />
          <ul className="flex flex-col gap-3 px-5 py-4" aria-label="Delivery outcomes">
            {DELIVERY_ORDER.map((k) => {
              const n = o.deliveryOutcomes[k];
              const tone = deliveryStatus[k].tone;
              return (
                <li key={k} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3">
                  <StatusBadge kind="delivery" status={k} size="sm" className="w-fit" label={k === 'DEAD' ? 'Dead-letter' : undefined} />
                  <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <span className={cn('block h-full rounded-full', toneClasses[tone].bar)} style={{ width: `${(n / maxDelivery) * 100}%` }} />
                  </span>
                  <span className="text-right text-body font-medium tabular text-fg">{formatNumber(n)}</span>
                </li>
              );
            })}
          </ul>
          {totalDeliveries > 0 && (
            <div className="border-t border-border px-5 py-4">
              <DeliveryProgress
                total={totalDeliveries}
                counts={{ DELIVERED: o.deliveryOutcomes.DELIVERED, SENT: o.deliveryOutcomes.SENT, RETRYING: o.deliveryOutcomes.FAILED, PENDING: o.deliveryOutcomes.PENDING, DEAD: o.deliveryOutcomes.DEAD }}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Average time in each step" description="Measured from the audit log: when a batch entered a step until its next status change." />
          <ul className="grid gap-3 px-5 py-4 sm:grid-cols-3">
            {(Object.keys(STEP_LABEL) as (keyof typeof STEP_LABEL)[]).map((k) => {
              const s = o.avgStepSeconds[k];
              const overSla = meta.data && s.avgSeconds !== null && s.avgSeconds > meta.data.slaSeconds;
              return (
                <li key={k} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-caption text-muted">
                    <Clock3 className="size-3.5" aria-hidden /> {STEP_LABEL[k]}
                  </p>
                  <p className={cn('mt-1 text-xl font-semibold tabular', overSla ? 'text-status-red-fg' : 'text-fg')}>{s.avgSeconds === null ? '–' : formatDuration(s.avgSeconds)}</p>
                  <p className="text-caption text-muted">
                    {s.samples ? plural(s.samples, 'batch', 'batches') : 'No finished steps yet'}
                    {overSla && ', over the SLA'}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Stuck batches"
          description="Past the SLA or waiting longest, oldest first."
          actions={
            <Link to="/stuck" className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline">
              See all stuck batches
            </Link>
          }
        />
        {stuck.isLoading ? (
          <SkeletonBlock className="p-5" />
        ) : !stuck.data || stuck.data.waiting.length === 0 ? (
          <EmptyState title="Nothing is waiting" description="No batch is in review right now." />
        ) : (
          <ul className="divide-y divide-border">
            {[...stuck.data.breached, ...stuck.data.waiting.filter((w) => !w.breached)].slice(0, 6).map((b) => (
              <li key={b.id}>
                <Link to={`/batches/${b.id}`} className="flex flex-col gap-1 px-5 py-3 transition-colors hover:bg-surface-2/60 sm:flex-row sm:items-center sm:gap-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{b.courseName}</span>
                    <span className="block text-caption text-muted">
                      {b.centre.name}, with {whoHasIt(b.status, b.district.name).toLowerCase()}
                    </span>
                  </span>
                  <StatusBadge kind="batch" status={b.status} size="sm" />
                  <SlaBadge enteredAt={b.currentStepEnteredAt} slaSeconds={stuck.data.slaSeconds} breachedAt={b.slaBreachedAt} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
