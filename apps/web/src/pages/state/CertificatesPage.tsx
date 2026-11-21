// State office: find any certificate (number, candidate name or course), open its
// PDF, and revoke it. Revoking needs a reason and typing the certificate number.
import { useQueryClient } from '@tanstack/react-query';
import { FileDown, Search, ShieldX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CopyButton } from '../../components/CopyButton';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/Display';
import { EmptyState } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/form';
import { certificateStatus, deliveryStatus } from '../../design/status';
import { useCertificateSearch } from '../../queries';
import { notify } from '../../toast';
import type { CertificateSearchRow } from '../../types';

export default function CertificatesPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [revoking, setRevoking] = useState<CertificateSearchRow | null>(null);
  const results = useCertificateSearch(q);

  useEffect(() => setInput(q), [q]);

  const columns: Column<CertificateSearchRow>[] = [
    {
      id: 'number',
      header: 'Certificate',
      cell: (c) => (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <a href={`/verify/${c.certificateNumber}`} target="_blank" rel="noreferrer" className="font-mono text-caption text-primary hover:underline">
            {c.certificateNumber}
          </a>
          <CopyButton value={c.certificateNumber} label="Copy certificate number" />
        </span>
      ),
      sortValue: (c) => c.certificateNumber,
      csv: (c) => c.certificateNumber,
    },
    {
      id: 'candidate',
      header: 'Candidate',
      cell: (c) => (
        <div>
          <div className="font-medium text-fg">{c.candidate.fullName}</div>
          <div className="font-mono text-caption text-muted">{c.candidate.enrolmentId}</div>
        </div>
      ),
      sortValue: (c) => c.candidate.fullName,
      csv: (c) => c.candidate.fullName,
    },
    {
      id: 'course',
      header: 'Course',
      hideBelow: 'md',
      cell: (c) => (
        <div>
          <Link to={`/batches/${c.batchId}`} className="text-fg hover:text-primary hover:underline">
            {c.batch.courseName}
          </Link>
          <div className="text-caption text-muted">{c.batch.centre.name}</div>
        </div>
      ),
      csv: (c) => c.batch.courseName,
    },
    { id: 'issued', header: 'Issued', hideBelow: 'lg', cell: (c) => <RelativeTime iso={c.issuedAt} className="whitespace-nowrap text-muted" />, sortValue: (c) => c.issuedAt, csv: (c) => c.issuedAt },
    {
      id: 'delivery',
      header: 'WhatsApp',
      hideBelow: 'sm',
      cell: (c) => (c.deliveries[0] ? <StatusBadge kind="delivery" status={c.deliveries[0].status} size="sm" /> : <span className="text-muted">–</span>),
      csv: (c) => (c.deliveries[0] ? deliveryStatus[c.deliveries[0].status].label : ''),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (c) => (
        <span title={c.revokeReason ? `Reason: ${c.revokeReason}` : undefined}>
          <StatusBadge kind="certificate" status={c.status} />
        </span>
      ),
      sortValue: (c) => c.status,
      csv: (c) => certificateStatus[c.status].label,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (c) => (
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="icon-sm" title="Open PDF" aria-label={`Open PDF of ${c.certificateNumber}`}>
            <a href={`/api/v1/certificates/${c.certificateNumber}/pdf`} target="_blank" rel="noreferrer">
              <FileDown />
            </a>
          </Button>
          {c.status === 'ISSUED' && (
            <Button variant="danger-outline" size="sm" onClick={() => setRevoking(c)}>
              <ShieldX aria-hidden /> Revoke
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Search by certificate number, candidate name or course. Revocation shows on the public verify page immediately."
        breadcrumb={[{ label: 'Overview', to: '/overview' }, { label: 'Certificates' }]}
      />
      <form
        role="search"
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(input.trim() ? { q: input.trim() } : {});
        }}
      >
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="PSM-2026-…, candidate name, or course" aria-label="Search certificates" className="pl-8" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <DataTable
        caption={q ? `Certificates matching ${q}` : 'Most recent certificates'}
        rows={results.data}
        loading={results.isLoading}
        error={results.error}
        onRetry={() => void results.refetch()}
        columns={columns}
        getRowId={(c) => c.certificateNumber}
        rowClassName={(c) => (c.status === 'REVOKED' ? 'opacity-75' : undefined)}
        csvFilename="certiflow-certificates.csv"
        empty={
          <EmptyState
            title={q ? `No certificates match “${q}”` : 'No certificates issued yet'}
            description={q ? 'Try part of the number, or the candidate’s first name.' : 'Certificates appear here after the State office gives final approval.'}
          />
        }
      />
      {!q && results.data && results.data.length === 50 && <p className="mt-2 text-caption text-muted">Showing the 50 most recent. Search to find older ones.</p>}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this certificate?"
        description={
          revoking ? `${revoking.candidate.fullName}, ${revoking.batch.courseName}. Public verification will show REVOKED immediately and the download link will stop working. This can’t be undone.` : undefined
        }
        confirmLabel="Revoke certificate"
        tone="danger"
        reason={{ label: 'Reason (kept private; the public page never shows it)', minLength: 5 }}
        typeToConfirm={revoking ? { value: revoking.certificateNumber, label: 'Type the certificate number' } : undefined}
        onConfirm={async (reason) => {
          await api(`/certificates/${encodeURIComponent(revoking!.certificateNumber)}/revoke`, { method: 'POST', json: { reason } });
          notify(`Certificate ${revoking!.certificateNumber} revoked`, 'success', 'Public verification now shows REVOKED.');
          for (const k of ['certificates', 'batch', 'overview', 'stats']) void qc.invalidateQueries({ queryKey: [k] });
        }}
      />
    </>
  );
}
