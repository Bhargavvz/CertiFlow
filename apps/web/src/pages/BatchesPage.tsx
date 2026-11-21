// Every batch the signed-in user may see (scoped by the server): search, filter by
// status, sort, and export what's on screen.
import { BATCH_STATUSES, type BatchStatus } from '@certiflow/shared';
import { FilePlus2, FileStack } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { DataTable, type Column } from '../components/DataTable';
import { PageHeader } from '../components/Display';
import { EmptyState } from '../components/Feedback';
import { RelativeTime } from '../components/RelativeTime';
import { StatusBadge } from '../components/StatusBadge';
import { StepProgress } from '../components/StepProgress';
import { homeCrumb } from '../components/shell/nav';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/form';
import { batchStatus } from '../design/status';
import { formatNumber } from '../format';
import { needsQuality, whoHasIt } from '../lib/workflow';
import { useBatches, useMeta } from '../queries';
import type { BatchSummary } from '../types';

export default function BatchesPage() {
  const { user } = useAuth();
  const batches = useBatches();
  const meta = useMeta();
  const [status, setStatus] = useState<BatchStatus | ''>('');
  const isCentre = user?.role === 'CENTRE';

  // Only offer statuses that actually occur, with counts.
  const statusCounts = useMemo(() => {
    const m = new Map<BatchStatus, number>();
    for (const b of batches.data ?? []) m.set(b.status, (m.get(b.status) ?? 0) + 1);
    return m;
  }, [batches.data]);

  const columns: Column<BatchSummary>[] = [
    {
      id: 'course',
      header: 'Course',
      cell: (b) => (
        <div className="min-w-[12rem]">
          <Link to={`/batches/${b.id}`} className="font-medium text-fg hover:text-primary hover:underline">
            {b.courseName}
          </Link>
          {!isCentre && <div className="text-caption text-muted">{b.centre.name}</div>}
        </div>
      ),
      sortValue: (b) => b.courseName.toLowerCase(),
      searchText: (b) => `${b.courseName} ${b.centre.name} ${b.district.name}`,
      csv: (b) => b.courseName,
    },
    ...(!isCentre
      ? [{ id: 'centre', header: 'Centre', cell: () => null, csv: (b: BatchSummary) => b.centre.name, csvOnly: true } as Column<BatchSummary>]
      : []),
    {
      id: 'candidates',
      header: 'Candidates',
      align: 'right',
      cell: (b) => <span className="tabular">{formatNumber(b.candidateCount)}</span>,
      sortValue: (b) => b.candidateCount,
      csv: (b) => b.candidateCount,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (b) => <StatusBadge kind="batch" status={b.status} />,
      sortValue: (b) => BATCH_STATUSES.indexOf(b.status),
      csv: (b) => batchStatus[b.status].label,
    },
    {
      id: 'progress',
      header: 'Progress',
      hideBelow: 'md',
      cell: (b) => <StepProgress status={b.status} needsQuality={needsQuality(b.candidateCount, meta.data)} variant="compact" />,
    },
    {
      id: 'with',
      header: 'With',
      hideBelow: 'lg',
      cell: (b) => <span className="text-muted">{whoHasIt(b.status, b.district.name)}</span>,
      csv: (b) => whoHasIt(b.status, b.district.name),
    },
    {
      id: 'revision',
      header: 'Rev.',
      align: 'right',
      hideBelow: 'lg',
      cell: (b) => <span className="tabular text-muted">{b.revision || '–'}</span>,
      sortValue: (b) => b.revision,
      csv: (b) => b.revision,
    },
    {
      id: 'updated',
      header: 'Updated',
      cell: (b) => <RelativeTime iso={b.updatedAt} className="whitespace-nowrap text-muted" />,
      sortValue: (b) => b.updatedAt,
      csv: (b) => b.updatedAt,
    },
  ];

  return (
    <>
      <PageHeader
        title={isCentre ? 'My batches' : user?.role === 'DISTRICT_OFFICER' ? 'District batches' : 'All batches'}
        description={isCentre ? 'Every batch your centre has created.' : 'Every batch you can see. Drafts stay private to their centre.'}
        breadcrumb={user ? [homeCrumb(user.role), { label: 'Batches' }] : undefined}
        actions={
          isCentre && (
            <Button asChild>
              <Link to="/batches/new">
                <FilePlus2 aria-hidden /> New batch
              </Link>
            </Button>
          )
        }
      />
      <DataTable
        caption="Batches"
        rows={batches.data}
        loading={batches.isLoading}
        error={batches.error}
        onRetry={() => void batches.refetch()}
        columns={columns}
        getRowId={(b) => b.id}
        rowHref={(b) => `/batches/${b.id}`}
        rowClassName={(b) => (b.slaBreachedAt ? 'bg-status-red-bg/30' : undefined)}
        initialSort={{ id: 'updated', dir: 'desc' }}
        searchPlaceholder={isCentre ? 'Search courses…' : 'Search course, centre or district…'}
        filter={status ? (b) => b.status === status : undefined}
        toolbar={
          <Select value={status} onChange={(e) => setStatus(e.target.value as BatchStatus | '')} aria-label="Filter by status" className="w-auto min-w-[11rem]">
            <option value="">All statuses ({batches.data?.length ?? 0})</option>
            {BATCH_STATUSES.filter((s) => statusCounts.has(s)).map((s) => (
              <option key={s} value={s}>
                {batchStatus[s].label} ({statusCounts.get(s)})
              </option>
            ))}
          </Select>
        }
        csvFilename="certiflow-batches.csv"
        empty={
          <EmptyState
            icon={FileStack}
            title={isCentre ? 'No batches yet' : 'No batches to show'}
            description={isCentre ? 'Create a batch, upload your candidate spreadsheet and submit it for review.' : 'Batches appear here once a centre submits them.'}
            action={
              isCentre && (
                <Button asChild size="sm">
                  <Link to="/batches/new">
                    <FilePlus2 aria-hidden /> Create your first batch
                  </Link>
                </Button>
              )
            }
          />
        }
      />
    </>
  );
}
