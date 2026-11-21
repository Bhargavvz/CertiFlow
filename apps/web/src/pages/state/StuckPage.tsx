// SLA dashboard: breaches first (escalated automatically by the sla.check job),
// then everything in review, oldest first, with who it's waiting on.
import { CheckCircle2, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader, StatCard } from '../../components/Display';
import { EmptyState } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { SlaBadge } from '../../components/SlaBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { batchStatus } from '../../design/status';
import { formatDuration } from '../../format';
import { whoHasIt } from '../../lib/workflow';
import { useStuck } from '../../queries';
import type { StuckItem } from '../../types';

export default function StuckPage() {
  const stuck = useStuck();
  const d = stuck.data;

  const columns: Column<StuckItem>[] = [
    {
      id: 'course',
      header: 'Batch',
      cell: (b) => (
        <div className="min-w-[12rem]">
          <Link to={`/batches/${b.id}`} className="font-medium text-fg hover:text-primary hover:underline">
            {b.courseName}
          </Link>
          <div className="text-caption text-muted">
            {b.centre.name} · {b.district.name}
          </div>
        </div>
      ),
      searchText: (b) => `${b.courseName} ${b.centre.name} ${b.district.name}`,
      sortValue: (b) => b.courseName,
      csv: (b) => b.courseName,
    },
    { id: 'step', header: 'Step', cell: (b) => <StatusBadge kind="batch" status={b.status} />, csv: (b) => batchStatus[b.status].label, sortValue: (b) => b.status },
    { id: 'with', header: 'With', hideBelow: 'md', cell: (b) => <span className="text-muted">{whoHasIt(b.status, b.district.name)}</span>, csv: (b) => whoHasIt(b.status, b.district.name) },
    {
      id: 'since',
      header: 'Waiting',
      cell: (b) => (
        <span className="whitespace-nowrap">
          {formatDuration(b.ageSeconds)}
          <span className="block text-caption text-muted">
            since <RelativeTime iso={b.currentStepEnteredAt} />
          </span>
        </span>
      ),
      sortValue: (b) => b.ageSeconds,
      csv: (b) => b.ageSeconds,
    },
    {
      id: 'sla',
      header: 'SLA',
      cell: (b) => <SlaBadge enteredAt={b.currentStepEnteredAt} slaSeconds={d?.slaSeconds} breachedAt={b.slaBreachedAt} />,
      sortValue: (b) => b.overdueSeconds,
      csv: (b) => (b.breached ? `overdue ${b.overdueSeconds}s` : 'ok'),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stuck batches"
        description={
          d
            ? `Each review step has ${formatDuration(d.slaSeconds)}${d.slaSource === 'override' ? ' (demo override)' : ''}. When it runs out, the batch is escalated here automatically and you get a notification.`
            : 'Batches waiting longer than the SLA are escalated here automatically.'
        }
        breadcrumb={[{ label: 'Overview', to: '/overview' }, { label: 'Stuck' }]}
      />
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="SLA breached" value={d?.breached.length ?? 0} icon={Siren} tone={d && d.breached.length > 0 ? 'red' : 'green'} loading={stuck.isLoading} />
        <StatCard label="In review" value={d?.waiting.length ?? 0} loading={stuck.isLoading} />
        <StatCard
          label="Oldest wait"
          value={d && d.waiting.length ? formatDuration(Math.max(...d.waiting.map((w) => w.ageSeconds))) : '–'}
          loading={stuck.isLoading}
        />
      </section>
      <DataTable
        caption="Batches in review"
        rows={d?.waiting}
        loading={stuck.isLoading}
        error={stuck.error}
        onRetry={() => void stuck.refetch()}
        columns={columns}
        getRowId={(b) => b.id}
        rowHref={(b) => `/batches/${b.id}`}
        rowClassName={(b) => (b.breached ? 'bg-status-red-bg/30' : undefined)}
        initialSort={{ id: 'since', dir: 'desc' }}
        searchPlaceholder="Search course, centre or district…"
        csvFilename="certiflow-stuck.csv"
        empty={<EmptyState icon={CheckCircle2} title="Nothing is waiting" description="No batch is in review, so nothing can be stuck." />}
      />
    </>
  );
}
