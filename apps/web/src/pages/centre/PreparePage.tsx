// Wizard steps 2-3 (upload, then review & submit). The same page is the "fix and
// resubmit" flow for a sent-back batch, with the documented rule spelled out:
// resubmitting resets every earlier approval (docs/DECISIONS.md D6).
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Download, Info, RotateCcw, Send, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../api';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader, StatCard } from '../../components/Display';
import { EmptyState, ErrorState, SkeletonBlock } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { StatusBadge } from '../../components/StatusBadge';
import { Button } from '../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { downloadTemplate } from '../../components/upload/template';
import { UploadDropzone } from '../../components/upload/UploadDropzone';
import { UploadErrors } from '../../components/upload/UploadErrors';
import { WizardSteps } from '../../components/upload/WizardSteps';
import { formatDate, formatDateTime, maskPhone, plural } from '../../format';
import { needsQuality } from '../../lib/workflow';
import { useBatch, useMeta } from '../../queries';
import { notify, notifyError } from '../../toast';
import type { BatchDetail, CandidateRow, RowError } from '../../types';

function SentBackBanner({ detail }: { detail: BatchDetail }) {
  const b = detail.batch;
  const sendBack = [...b.approvals].reverse().find((a) => a.decision === 'SEND_BACK' && a.revision === b.revision);
  const resetCount = b.approvals.filter((a) => a.revision === b.revision && !a.superseded && !a.withdrawnAt && a.decision === 'APPROVE').length;
  return (
    <div role="status" className="mb-6 overflow-hidden rounded-xl border border-status-orange-dot/40 bg-surface">
      <div className="flex gap-3 bg-status-orange-bg/70 px-5 py-4">
        <RotateCcw className="mt-0.5 size-5 shrink-0 text-status-orange-fg" aria-hidden />
        <div className="min-w-0">
          <p className="font-semibold text-status-orange-fg">This batch was sent back for changes</p>
          {b.sendBackReason && <p className="mt-1 text-body text-fg">“{b.sendBackReason}”</p>}
          {sendBack && (
            <p className="mt-1 text-caption text-muted">
              {sendBack.officer.name} · <span title={formatDateTime(sendBack.createdAt)}><RelativeTime iso={sendBack.createdAt} /></span>
            </p>
          )}
        </div>
      </div>
      <p className="flex gap-2 px-5 py-3 text-caption text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          When you resubmit, review starts again at the district step as revision {b.revision + 1}.
          {resetCount > 0 ? ` The ${plural(resetCount, 'approval')} already given will be reset` : ' Any earlier approvals are reset'}, because the
          content may have changed.
        </span>
      </p>
    </div>
  );
}

export default function PreparePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const detail = useBatch(id);
  const meta = useMeta();
  const [step, setStep] = useState<'upload' | 'review' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rowErrors, setRowErrors] = useState<{ errors: RowError[]; totalRows: number; fileName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (detail.isLoading) return <SkeletonBlock lines={6} className="mx-auto max-w-3xl" />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const d = detail.data;
  const b = d.batch;
  const resubmitting = b.status === 'SENT_BACK';

  if (!d.allowed.edit) {
    return (
      <EmptyState
        title="This batch can’t be changed now"
        description={`It is ${b.status === 'DRAFT' ? 'a draft you don’t own' : 'already in review or finished'}. You can still follow its progress.`}
        action={
          <Button asChild variant="secondary">
            <Link to={`/batches/${b.id}`}>Open batch</Link>
          </Button>
        }
      />
    );
  }

  // Default step: review if there's already a candidate list, else upload.
  const current = step ?? (b.candidateCount > 0 ? 'review' : 'upload');

  const upload = async (f: File) => {
    setFile(f);
    setUploading(true);
    setRowErrors(null);
    const form = new FormData();
    form.append('file', f);
    try {
      const res = await api<{ imported: number }>(`/batches/${b.id}/candidates/import`, { method: 'POST', body: form });
      await qc.invalidateQueries({ queryKey: ['batch', b.id] });
      void qc.invalidateQueries({ queryKey: ['batches'] });
      notify(`${plural(res.imported, 'candidate')} imported`, 'success', 'Every row passed the checks.');
      setFile(null);
      setStep('review');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'INVALID_SPREADSHEET') {
        const details = e.details as { errors: RowError[]; totalRows: number };
        setRowErrors({ ...details, fileName: f.name });
      } else {
        notifyError(e, 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await api(`/batches/${b.id}/${resubmitting ? 'resubmit' : 'submit'}`, { method: 'POST', json: { version: b.version } });
      for (const key of ['batch', 'batches', 'stats', 'queue']) void qc.invalidateQueries({ queryKey: [key] });
      notify(resubmitting ? 'Batch resubmitted for review' : 'Batch submitted for review', 'success', 'District officers have been notified.');
      navigate(`/batches/${b.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') void detail.refetch();
      notifyError(e, 'Couldn’t submit');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: Column<CandidateRow>[] = [
    { id: 'enrolment', header: 'Enrolment ID', cell: (c) => <span className="font-mono text-caption">{c.enrolmentId}</span>, sortValue: (c) => c.enrolmentId, searchText: (c) => c.enrolmentId },
    { id: 'name', header: 'Name', cell: (c) => <span className="font-medium text-fg">{c.fullName}</span>, sortValue: (c) => c.fullName, searchText: (c) => c.fullName },
    { id: 'phone', header: 'Phone', cell: (c) => <span className="font-mono text-caption text-muted">{maskPhone(c.phone)}</span> },
    { id: 'score', header: 'Score', align: 'right', cell: (c) => <span className="tabular">{c.score}</span>, sortValue: (c) => c.score },
    { id: 'passed', header: 'Passed on', hideBelow: 'sm', cell: (c) => formatDate(c.passedOn), sortValue: (c) => c.passedOn },
  ];
  const avg = b.candidates.length ? Math.round(b.candidates.reduce((s, c) => s + c.score, 0) / b.candidates.length) : 0;
  const quality = needsQuality(b.candidateCount, meta.data);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={b.courseName}
        description={resubmitting ? 'Fix the problem, check the list, then resubmit.' : 'Upload your candidates, check the list, then submit for review.'}
        breadcrumb={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Batches', to: '/batches' }, { label: b.courseName, to: `/batches/${b.id}` }, { label: resubmitting ? 'Fix and resubmit' : 'Prepare' }]}
        meta={<StatusBadge kind="batch" status={b.status} />}
      />
      {resubmitting && <SentBackBanner detail={d} />}
      <WizardSteps current={current === 'upload' ? 1 : 2} />

      {current === 'upload' ? (
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title={b.candidateCount > 0 ? 'Replace the candidate list' : 'Upload candidates'}
              description={
                b.candidateCount > 0
                  ? `Uploading replaces all ${b.candidateCount} current candidates, but only if the new file is completely valid.`
                  : 'Every row is checked first. If anything is wrong, nothing is saved and you get the exact list of problems.'
              }
              actions={
                <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                  <Download aria-hidden /> Template
                </Button>
              }
            />
            <CardBody>
              <UploadDropzone maxBytes={meta.data?.maxUploadBytes ?? 2 * 1024 * 1024} busy={uploading} file={file} onFile={(f) => void upload(f)} onClear={() => setFile(null)} />
            </CardBody>
          </Card>
          {rowErrors && <UploadErrors errors={rowErrors.errors} totalRows={rowErrors.totalRows} fileName={rowErrors.fileName} />}
          <div className="flex justify-between">
            <Button variant="ghost" asChild>
              <Link to="/dashboard">
                <ArrowLeft aria-hidden /> Save as draft
              </Link>
            </Button>
            {b.candidateCount > 0 && (
              <Button variant="secondary" onClick={() => setStep('review')}>
                Keep current list <ArrowRight aria-hidden />
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-label="Batch summary" className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Candidates" value={b.candidateCount} hint={meta.data ? `Limit ${meta.data.maxImportRows}` : undefined} />
            <StatCard label="Average score" value={avg} hint="Out of 100" />
            <StatCard
              label="Review route"
              value={quality ? '3 steps' : '2 steps'}
              hint={quality ? `District → Quality → State (${meta.data?.qualityThreshold}+ candidates)` : 'District → State'}
            />
          </section>

          <Card>
            <CardHeader
              title="Check the candidate list"
              description="Phone numbers are partly hidden here; officers see them in full during review."
              actions={
                <Button variant="secondary" size="sm" onClick={() => setStep('upload')}>
                  <Upload aria-hidden /> Replace file
                </Button>
              }
            />
            <CardBody>
              <DataTable caption="Candidates in this batch" rows={b.candidates} columns={columns} getRowId={(c) => c.id} searchPlaceholder="Search name or enrolment ID…" dense />
            </CardBody>
          </Card>

          <div className="flex flex-col-reverse gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-caption text-muted">
              After you submit, the batch is locked. Two district officers must approve it
              {quality ? ', then the quality team, then the State office.' : ', then the State office.'}
            </p>
            <Button size="lg" onClick={() => void submit()} loading={submitting} disabled={b.candidateCount === 0}>
              <Send aria-hidden /> {resubmitting ? 'Resubmit for review' : 'Submit for review'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
