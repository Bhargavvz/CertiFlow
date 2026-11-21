// "Waiting for me": the review queue for district officers, quality and the State
// office. Oldest first, with live SLA countdowns and approval progress.
import { ClipboardCheck, Info, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/Display';
import { EmptyState } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { SlaBadge } from '../../components/SlaBadge';
import { Pill, StatusBadge } from '../../components/StatusBadge';
import { batchStatus } from '../../design/status';
import { formatDuration, formatNumber } from '../../format';
import { useMeta, useWorkQueue } from '../../queries';
import type { QueueItem } from '../../types';

const COPY = {
  DISTRICT_OFFICER: {
    title: 'Waiting for me',
    description: 'Batches from your district’s centres. Each needs approvals from two different officers.',
  },
  QUALITY: {
    title: 'Quality queue',
    description: 'Large batches that need a quality check before they reach the State office.',
  },
  STATE: {
    title: 'Final approval',
    description: 'Batches approved by their district (and quality, if large). Your approval issues the certificates.',
  },
  CENTRE: { title: 'Needs your action', description: 'Drafts and sent-back batches.' },
} as const;

export default function QueuePage() {
  const { user } = useAuth();
  const queue = useWorkQueue();
  const meta = useMeta();
  if (!user) return null;
  const copy = COPY[user.role];
  const isDistrict = user.role === 'DISTRICT_OFFICER';

  const columns: Column<QueueItem>[] = [
    {
      id: 'course',
      header: 'Batch',
      cell: (b) => (
        <div className="min-w-[12rem]">
          <Link to={`/batches/${b.id}`} className="font-medium text-fg hover:text-primary hover:underline">
            {b.courseName}
          </Link>
          <div className="text-caption text-muted">
            {b.centre.name}
            {b.revision > 1 && <span className="ml-1.5 text-subtle">(revision {b.revision})</span>}
          </div>
        </div>
      ),
      sortValue: (b) => b.courseName.toLowerCase(),
      searchText: (b) => `${b.courseName} ${b.centre.name}`,
      csv: (b) => b.courseName,
    },
    { id: 'centre', header: 'Centre', cell: () => null, csv: (b) => b.centre.name, csvOnly: true },
    {
      id: 'candidates',
      header: 'Candidates',
      align: 'right',
      cell: (b) => <span className="tabular">{formatNumber(b.candidateCount)}</span>,
      sortValue: (b) => b.candidateCount,
      csv: (b) => b.candidateCount,
    },
    ...(isDistrict
      ? [
          {
            id: 'approvals',
            header: 'Approvals',
            cell: (b: QueueItem) => (
              <div className="flex flex-col gap-1">
                <span className="tabular font-medium text-fg">
                  {b.districtApprovals} of {meta.data?.requiredDistrictApprovals ?? 2}
                </span>
                {b.approverNames.length > 0 && <span className="text-caption text-muted">{b.approverNames.join(', ')} approved</span>}
                {b.iApproved && (
                  <Pill tone="green" className="w-fit">
                    You approved
                  </Pill>
                )}
              </div>
            ),
            sortValue: (b: QueueItem) => b.districtApprovals,
            csv: (b: QueueItem) => b.districtApprovals,
          } as Column<QueueItem>,
        ]
      : [
          {
            id: 'status',
            header: 'Status',
            hideBelow: 'md',
            cell: (b: QueueItem) => <StatusBadge kind="batch" status={b.status} />,
            csv: (b: QueueItem) => batchStatus[b.status].label,
          } as Column<QueueItem>,
        ]),
    {
      id: 'waiting',
      header: 'Waiting',
      cell: (b) => (
        <span className="whitespace-nowrap text-muted" title={`Since ${b.waitingSince}`}>
          {formatDuration(b.ageSeconds)}
          <span className="sr-only">
            {' '}
            (since <RelativeTime iso={b.waitingSince} />)
          </span>
        </span>
      ),
      sortValue: (b) => b.ageSeconds,
      csv: (b) => b.ageSeconds,
    },
    {
      id: 'sla',
      header: 'SLA',
      cell: (b) => <SlaBadge enteredAt={b.currentStepEnteredAt} slaSeconds={meta.data?.slaSeconds} breachedAt={b.slaBreachedAt} />,
      sortValue: (b) => (b.slaBreachedAt ? -1e12 : b.slaDueAt ? new Date(b.slaDueAt).getTime() : 1e15),
      csv: (b) => (b.slaBreachedAt ? 'breached' : (b.slaDueAt ?? '')),
    },
  ];

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />

      {user.role === 'QUALITY' && meta.data && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-body text-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <strong className="font-medium text-fg">Why is a batch here?</strong> Batches with {meta.data.qualityThreshold} or more candidates need a
            quality check after the district approves them, before final approval.
          </span>
        </p>
      )}

      <DataTable
        caption={copy.title}
        rows={queue.data}
        loading={queue.isLoading}
        error={queue.error}
        onRetry={() => void queue.refetch()}
        columns={columns}
        getRowId={(b) => b.id}
        rowHref={(b) => `/batches/${b.id}`}
        rowClassName={(b) => (b.slaBreachedAt ? 'bg-status-red-bg/30' : undefined)}
        initialSort={{ id: 'waiting', dir: 'desc' }}
        searchPlaceholder="Search course or centre…"
        csvFilename="certiflow-queue.csv"
        empty={
          <EmptyState
            icon={user.role === 'QUALITY' ? ClipboardCheck : ListChecks}
            title="Nothing is waiting for you"
            description="New batches appear here as soon as they reach your step. You’ll get a notification too."
          />
        }
      />
    </>
  );
}
