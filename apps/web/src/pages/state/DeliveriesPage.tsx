// WhatsApp deliveries: live progress per batch, and the dead-letter list (deliveries
// that exhausted their retries) with a one-click, audited retry.
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/Display';
import { EmptyState, ErrorState, SkeletonBlock } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { DeliveryProgress, progressCounts } from '../../components/review/DeliveryProgress';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { useDeliveries } from '../../queries';
import { notify } from '../../toast';
import type { DeliveriesOverview } from '../../types';

type Dead = DeliveriesOverview['dead'][number];

export default function DeliveriesPage() {
  const qc = useQueryClient();
  const deliveries = useDeliveries();
  const [retrying, setRetrying] = useState<Dead | null>(null);

  const columns: Column<Dead>[] = [
    {
      id: 'candidate',
      header: 'Candidate',
      cell: (d) => (
        <div>
          <div className="font-medium text-fg">{d.candidateName}</div>
          <div className="font-mono text-caption text-muted">{d.phone}</div>
        </div>
      ),
      searchText: (d) => `${d.candidateName} ${d.certificateNumber} ${d.courseName}`,
      sortValue: (d) => d.candidateName,
      csv: (d) => d.candidateName,
    },
    {
      id: 'batch',
      header: 'Batch',
      hideBelow: 'md',
      cell: (d) => (
        <div>
          <Link to={`/batches/${d.batchId}`} className="text-fg hover:text-primary hover:underline">
            {d.courseName}
          </Link>
          <div className="text-caption text-muted">{d.centreName}</div>
        </div>
      ),
      csv: (d) => d.courseName,
    },
    { id: 'number', header: 'Certificate', hideBelow: 'lg', cell: (d) => <span className="font-mono text-caption">{d.certificateNumber}</span>, csv: (d) => d.certificateNumber },
    {
      id: 'error',
      header: 'Last error',
      cell: (d) => (
        <div className="max-w-xs">
          <div className="text-caption text-status-red-fg">{d.lastError ?? 'Unknown error'}</div>
          <div className="text-caption text-muted">
            {d.attempts} attempts{d.generation > 1 && `, message ${d.generation}`}, last <RelativeTime iso={d.updatedAt} />
          </div>
        </div>
      ),
      csv: (d) => d.lastError ?? '',
    },
    {
      id: 'retry',
      header: '',
      align: 'right',
      cell: (d) => (
        <Button size="sm" variant="secondary" onClick={() => setRetrying(d)}>
          <RotateCcw aria-hidden /> Retry
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Deliveries"
        description="Every certificate goes out on WhatsApp. Temporary failures retry automatically with backoff; ones that keep failing land in the dead-letter list below."
        breadcrumb={[{ label: 'Overview', to: '/overview' }, { label: 'Deliveries' }]}
        actions={
          <Button asChild variant="ghost" size="sm">
            <a href="/admin/queues" target="_blank" rel="noreferrer">
              Job queues <ExternalLink aria-hidden />
            </a>
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Recent issuing batches" description="Updates live as messages are accepted and delivered." />
        {deliveries.isLoading ? (
          <SkeletonBlock className="p-5" />
        ) : deliveries.error ? (
          <ErrorState error={deliveries.error} onRetry={() => void deliveries.refetch()} />
        ) : deliveries.data!.batches.length === 0 ? (
          <EmptyState title="No batches have been issued yet" description="When you give final approval, issuance progress shows up here." />
        ) : (
          <ul className="divide-y divide-border">
            {deliveries.data!.batches.map((b) => (
              <li key={b.id} className="grid gap-2 px-5 py-4 md:grid-cols-[minmax(0,16rem)_1fr] md:items-center md:gap-6">
                <div className="min-w-0">
                  <Link to={`/batches/${b.id}`} className="block truncate font-medium text-fg hover:text-primary hover:underline">
                    {b.courseName}
                  </Link>
                  <span className="flex items-center gap-2 text-caption text-muted">
                    <StatusBadge kind="batch" status={b.status} size="sm" />
                    <span className="truncate">{b.centre.name}</span>
                  </span>
                </div>
                <DeliveryProgress total={b.candidateCount} counts={progressCounts(b.counts)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 text-section text-fg">Dead-letter deliveries</h2>
      <DataTable
        caption="Deliveries that failed after all retries"
        rows={deliveries.data?.dead}
        loading={deliveries.isLoading}
        columns={columns}
        getRowId={(d) => d.id}
        searchPlaceholder="Search candidate, certificate or course…"
        csvFilename="certiflow-dead-letter.csv"
        empty={<EmptyState icon={CheckCircle2} title="No failed deliveries" description="Every certificate so far reached its candidate, or is still being retried." />}
      />

      <ConfirmDialog
        open={retrying !== null}
        onOpenChange={(o) => !o && setRetrying(null)}
        title="Retry this delivery?"
        description={
          retrying
            ? `A new WhatsApp message (with a new idempotency key) is sent to ${retrying.candidateName}. If the batch was partly delivered, it goes back to “Issuing” until this finishes.`
            : undefined
        }
        confirmLabel="Retry delivery"
        onConfirm={async () => {
          await api(`/state/deliveries/${retrying!.id}/retry`, { method: 'POST' });
          notify('Delivery queued again', 'success');
          for (const k of ['deliveries', 'batch', 'overview']) void qc.invalidateQueries({ queryKey: [k] });
        }}
      />
    </>
  );
}
