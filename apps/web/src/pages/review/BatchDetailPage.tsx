// One batch, for every internal role (the server scopes who may open it):
// pipeline, approvals, the review action bar, candidates, deliveries and timeline.
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Award,
  FileDown,
  RotateCcw,
  ShieldX,
  Undo2,
  Users,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isReviewState } from '@certiflow/shared';
import { ApiError, api } from '../../api';
import { useAuth } from '../../auth';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { Avatar, PageHeader } from '../../components/Display';
import { ErrorState, SkeletonBlock } from '../../components/Feedback';
import { RelativeTime } from '../../components/RelativeTime';
import { ActionBar, type ReviewAction } from '../../components/review/ActionBar';
import { DeliveryProgress } from '../../components/review/DeliveryProgress';
import { reviewActions } from '../../components/review/reviewActions';
import { homeCrumb } from '../../components/shell/nav';
import { SlaBadge } from '../../components/SlaBadge';
import { Pill, StatusBadge } from '../../components/StatusBadge';
import { StepProgress } from '../../components/StepProgress';
import { Timeline } from '../../components/Timeline';
import { Button } from '../../components/ui/button';
import { Card, CardBody, CardHeader } from '../../components/ui/card';
import { Tooltip } from '../../components/ui/overlays';
import { formatDate, formatDateTime, formatNumber, humanise, plural } from '../../format';
import { cn } from '../../lib/cn';
import { whoHasIt } from '../../lib/workflow';
import { useBatch, useMeta } from '../../queries';
import { notify, notifyError } from '../../toast';
import type { ApprovalRow, BatchDetail, CandidateRow } from '../../types';

const VERB: Record<ApprovalRow['decision'], string> = { APPROVE: 'approved', SEND_BACK: 'sent back', REJECT: 'rejected' };

function ApprovalsPanel({ detail, onWithdraw, withdrawing }: { detail: BatchDetail; onWithdraw: () => void; withdrawing: boolean }) {
  const b = detail.batch;
  const current = b.approvals.filter((a) => a.revision === b.revision);
  const earlier = b.approvals.filter((a) => a.revision !== b.revision);
  const { user } = useAuth();
  const actions = user ? reviewActions(detail, user) : null;

  return (
    <Card>
      <CardHeader title={b.revision > 1 ? `Decisions on revision ${b.revision}` : 'Decisions'} description={b.status === 'PENDING_DISTRICT' ? `${detail.districtApprovals.count} of ${detail.districtApprovals.required} district approvals` : undefined} />
      <CardBody className="flex flex-col gap-3">
        {current.length === 0 ? (
          <p className="text-body text-muted">{b.revision === 0 ? 'Not submitted yet.' : 'No decisions on this revision yet.'}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {current.map((a) => (
              <li key={a.id} className={cn('flex gap-3', a.withdrawnAt && 'opacity-60')}>
                <Avatar name={a.officer.name} role={a.officer.role} />
                <div className="min-w-0 flex-1 text-body">
                  <p className={cn('text-fg', a.withdrawnAt && 'line-through')}>
                    <span className="font-medium">{a.officer.name}</span> {VERB[a.decision]}
                    {a.officerId === user?.id && <span className="text-muted"> (you)</span>}
                  </p>
                  <p className="text-caption text-muted">
                    {humanise(a.step)} step, <RelativeTime iso={a.createdAt} />
                    {a.withdrawnAt && (
                      <>
                        {' '}
                        , withdrawn <RelativeTime iso={a.withdrawnAt} />
                      </>
                    )}
                  </p>
                  {a.reason && <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-caption text-fg">“{a.reason}”</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {actions?.withdraw.visible && (
          <Tooltip content={actions.withdraw.reason}>
            <span className="w-fit">
              <Button variant="ghost" size="sm" onClick={onWithdraw} disabled={!actions.withdraw.enabled} loading={withdrawing}>
                <Undo2 aria-hidden /> Withdraw my approval
              </Button>
            </span>
          </Tooltip>
        )}
        {earlier.length > 0 && (
          <details className="text-caption">
            <summary className="cursor-pointer text-muted hover:text-fg">{plural(earlier.length, 'decision')} from earlier revisions (reset)</summary>
            <ul className="mt-2 flex flex-col gap-1 border-l-2 border-border pl-3">
              {earlier.map((a) => (
                <li key={a.id} className="text-muted">
                  Revision {a.revision}: {a.officer.name} {VERB[a.decision]} at the {humanise(a.step).toLowerCase()} step
                  {a.reason && <> – “{a.reason}”</>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardBody>
    </Card>
  );
}

type Tab = 'candidates' | 'deliveries' | 'timeline';

export default function BatchDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const detail = useBatch(id);
  const meta = useMeta();
  const [tab, setTab] = useState<Tab>('candidates');
  const [dialog, setDialog] = useState<ReviewAction | 'withdraw' | 'retry' | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (detail.isLoading) return <SkeletonBlock lines={8} />;
  if (detail.error || !detail.data || !user) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;

  const d = detail.data;
  const b = d.batch;
  const issuing = ['APPROVED', 'ISSUING', 'ISSUED', 'PARTIALLY_ISSUED'].includes(b.status);
  const rejection = b.status === 'REJECTED' ? [...b.approvals].reverse().find((a) => a.decision === 'REJECT') : undefined;
  const sendBack = b.status === 'SENT_BACK' ? [...b.approvals].reverse().find((a) => a.decision === 'SEND_BACK' && a.revision === b.revision) : undefined;

  const refreshAll = () => {
    for (const key of ['batch', 'batches', 'queue', 'stats', 'timeline', 'notifications']) void qc.invalidateQueries({ queryKey: [key] });
  };

  /** 409 handling: say who got there first, then show the fresh state. */
  const explainConflict = async () => {
    const fresh = (await detail.refetch()).data;
    const latest = fresh?.batch.approvals.filter((a) => a.officerId !== user.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
    notify(
      latest ? `${latest.officer.name} already ${VERB[latest.decision]} this batch. We’ve refreshed it.` : 'This batch changed a moment ago. We’ve refreshed it.',
      'info',
      'Check the latest state before acting again.',
    );
  };

  const decide = async (action: ReviewAction, reason?: string) => {
    setBusy(true);
    try {
      await api(`/batches/${b.id}/decisions`, {
        method: 'POST',
        headers: { 'If-Match': String(b.version) },
        json: { action, ...(reason ? { reason } : {}) },
      });
      notify(
        action === 'approve' ? (b.status === 'PENDING_STATE' ? 'Final approval given. Issuing certificates…' : 'Approved') : action === 'reject' ? 'Batch rejected' : 'Sent back to the centre',
        'success',
      );
      refreshAll();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === 'VERSION_CONFLICT') {
        await explainConflict();
        return;
      }
      if (e instanceof ApiError && e.status === 409) void detail.refetch();
      throw e; // ConfirmDialog shows it inline; direct approve falls through to the catch below
    } finally {
      setBusy(false);
    }
  };

  const onAction = (a: ReviewAction) => {
    // Plain district/quality approval needs no dialog; everything else confirms.
    if (a === 'approve' && b.status !== 'PENDING_STATE') {
      void decide('approve').catch((e) => notifyError(e, 'Couldn’t approve'));
      return;
    }
    setDialog(a);
  };

  const dupPhones = new Set<string>();
  {
    const seen = new Set<string>();
    for (const c of b.candidates) (seen.has(c.phone) ? dupPhones : seen).add(c.phone);
  }

  const canRevoke = d.allowed.revoke;
  const columns: Column<CandidateRow>[] = [
    { id: 'enrolment', header: 'Enrolment ID', cell: (c) => <span className="font-mono text-caption">{c.enrolmentId}</span>, sortValue: (c) => c.enrolmentId, searchText: (c) => c.enrolmentId, csv: (c) => c.enrolmentId },
    {
      id: 'name',
      header: 'Name',
      cell: (c) => <span className="font-medium text-fg">{c.fullName}</span>,
      sortValue: (c) => c.fullName,
      searchText: (c) => c.fullName,
      csv: (c) => c.fullName,
    },
    {
      id: 'phone',
      header: 'Phone',
      hideBelow: 'md',
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-caption">
          {c.phone}
          {dupPhones.has(c.phone) && (
            <Tooltip content="Another candidate in this batch has the same phone number. Both certificates would go to one phone.">
              <span tabIndex={0} className="inline-flex items-center gap-0.5 rounded-full bg-status-amber-bg px-1.5 text-[0.6875rem] font-sans font-medium text-status-amber-fg">
                <AlertTriangle className="size-3" aria-hidden /> Shared
              </span>
            </Tooltip>
          )}
        </span>
      ),
      searchText: (c) => c.phone,
      csv: (c) => c.phone,
    },
    { id: 'score', header: 'Score', align: 'right', cell: (c) => <span className="tabular">{c.score}</span>, sortValue: (c) => c.score, csv: (c) => c.score },
    { id: 'passed', header: 'Passed on', hideBelow: 'lg', cell: (c) => <span className="whitespace-nowrap">{formatDate(c.passedOn)}</span>, sortValue: (c) => c.passedOn, csv: (c) => c.passedOn },
    ...(issuing
      ? ([
          {
            id: 'certificate',
            header: 'Certificate',
            cell: (c: CandidateRow) =>
              c.certificate ? (
                <div className="flex flex-col gap-1">
                  <a href={`/verify/${c.certificate.certificateNumber}`} target="_blank" rel="noreferrer" className="font-mono text-caption text-primary hover:underline">
                    {c.certificate.certificateNumber}
                  </a>
                  <StatusBadge kind="certificate" status={c.certificate.status} size="sm" className="w-fit" />
                </div>
              ) : (
                <span className="text-caption text-muted">Generating…</span>
              ),
            searchText: (c: CandidateRow) => c.certificate?.certificateNumber ?? '',
            csv: (c: CandidateRow) => c.certificate?.certificateNumber ?? '',
          },
          {
            id: 'delivery',
            header: 'WhatsApp',
            cell: (c: CandidateRow) => {
              const dl = c.certificate?.deliveries[0];
              return dl ? (
                <span title={dl.lastError ?? undefined} className="flex flex-col gap-0.5">
                  <StatusBadge kind="delivery" status={dl.status} size="sm" className="w-fit" />
                  {dl.attempts > 1 && <span className="text-[0.6875rem] text-muted">{dl.attempts} attempts</span>}
                </span>
              ) : (
                <span className="text-caption text-muted">–</span>
              );
            },
            csv: (c: CandidateRow) => c.certificate?.deliveries[0]?.status ?? '',
          },
          ...(canRevoke
            ? [
                {
                  id: 'actions',
                  header: '',
                  align: 'right',
                  cell: (c: CandidateRow) =>
                    c.certificate && (
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon-sm" aria-label={`Open PDF of ${c.certificate.certificateNumber}`} title="Open PDF">
                          <a href={`/api/v1/certificates/${c.certificate.certificateNumber}/pdf`} target="_blank" rel="noreferrer">
                            <FileDown />
                          </a>
                        </Button>
                        {c.certificate.status === 'ISSUED' && (
                          <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${c.certificate.certificateNumber}`} title="Revoke" onClick={() => setRevoking(c.certificate!.certificateNumber)}>
                            <ShieldX className="text-status-red-fg" />
                          </Button>
                        )}
                      </div>
                    ),
                } as Column<CandidateRow>,
              ]
            : []),
        ] as Column<CandidateRow>[])
      : []),
  ];

  const ds = d.deliverySummary;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'candidates', label: `Candidates (${b.candidates.length})` },
    ...(issuing ? [{ id: 'deliveries' as Tab, label: 'Deliveries' }] : []),
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <>
      <PageHeader
        title={b.courseName}
        breadcrumb={[homeCrumb(user.role), { label: 'Batches', to: '/batches' }, { label: b.courseName }]}
        meta={
          <>
            <StatusBadge kind="batch" status={b.status} />
            {b.revision > 1 && <Pill tone="slate">Revision {b.revision}</Pill>}
            {isReviewState(b.status) && <SlaBadge enteredAt={b.currentStepEnteredAt} slaSeconds={meta.data?.slaSeconds} breachedAt={b.slaBreachedAt} />}
          </>
        }
        actions={
          d.allowed.edit && (
            <Button asChild size="lg" variant={b.status === 'SENT_BACK' ? 'primary' : 'secondary'}>
              <Link to={`/batches/${b.id}/prepare`}>{b.status === 'SENT_BACK' ? 'Fix and resubmit' : b.candidateCount ? 'Review and submit' : 'Upload candidates'}</Link>
            </Button>
          )
        }
      />

      {/* Dossier: the batch's key facts in one ruled row, then the approval route. */}
      <Card className="mb-6 overflow-hidden">
        <dl className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
          {[
            ['Training centre', b.centre.name],
            ['District', b.district.name],
            ['Candidates', formatNumber(b.candidateCount)],
            [
              isReviewState(b.status) ? 'Waiting for' : 'Last change',
              isReviewState(b.status) ? whoHasIt(b.status, b.district.name) : <RelativeTime iso={b.updatedAt} />,
            ],
          ].map(([k, v], i) => (
            <div key={String(k)} className={cn('min-w-0 px-5 py-3.5', i > 0 && 'border-l border-border', i === 2 && 'max-sm:border-l-0 max-sm:border-t', i === 3 && 'max-sm:border-t')}>
              <dt className="text-micro font-medium text-muted">{k}</dt>
              <dd className="mt-0.5 truncate font-semibold text-fg">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="px-5 py-6">
          <StepProgress
            status={b.status}
            needsQuality={d.needsQualityReview}
            districtApprovals={b.status === 'PENDING_DISTRICT' ? { count: d.districtApprovals.count, required: d.districtApprovals.required } : undefined}
            rejectedAt={rejection?.step}
          />
          {isReviewState(b.status) && (
            <p className="mt-5 text-center text-caption text-muted">
              At this step since{' '}
              <span title={formatDateTime(b.currentStepEnteredAt)} className="font-medium text-fg">
                <RelativeTime iso={b.currentStepEnteredAt} />
              </span>
            </p>
          )}
        </div>
      </Card>

      {sendBack && (
        <div role="status" className="mb-6 flex gap-3 rounded-lg border border-status-orange-dot/35 border-l-4 border-l-status-orange-dot bg-surface px-5 py-4">
          <RotateCcw className="mt-0.5 size-5 shrink-0 text-status-orange-fg" aria-hidden />
          <div>
            <p className="font-semibold text-status-orange-fg">Sent back by {sendBack.officer.name}</p>
            <p className="mt-1.5 rounded-md bg-surface-2 px-3 py-2 text-body text-fg">“{sendBack.reason}”</p>
            <p className="mt-1.5 text-caption text-muted">
              <RelativeTime iso={sendBack.createdAt} />. Resubmitting resets every approval on this revision.
            </p>
          </div>
        </div>
      )}
      {rejection && (
        <div role="status" className="mb-6 flex gap-3 rounded-lg border border-status-red-dot/35 border-l-4 border-l-status-red-dot bg-surface px-5 py-4">
          <XCircle className="mt-0.5 size-5 shrink-0 text-status-red-fg" aria-hidden />
          <div>
            <p className="font-semibold text-status-red-fg">Rejected by {rejection.officer.name}. This is final.</p>
            <p className="mt-1.5 rounded-md bg-surface-2 px-3 py-2 text-body text-fg">“{rejection.reason}”</p>
            <p className="mt-1.5 text-caption text-muted">
              <RelativeTime iso={rejection.createdAt} />
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div role="tablist" aria-label="Batch sections" className="mb-4 flex gap-1 border-b border-border">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-body font-medium transition-colors',
                  tab === t.id ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'candidates' && (
              <DataTable
                caption="Candidates"
                rows={b.candidates}
                columns={columns}
                getRowId={(c) => c.id}
                searchPlaceholder="Search name, enrolment ID, phone or certificate…"
                csvFilename={`batch-${b.courseName.replace(/\W+/g, '-').toLowerCase()}-candidates.csv`}
                dense
                empty={<p className="px-4 py-10 text-center text-body text-muted">No candidates uploaded yet.</p>}
              />
            )}
            {tab === 'deliveries' && (
              <Card>
                <CardHeader
                  title="WhatsApp delivery"
                  description="Updates live. Failed sends retry automatically; a provider-confirmed failure is resent once with a new message."
                  actions={
                    d.allowed.retryDeliveries && (
                      <Button size="sm" onClick={() => setDialog('retry')}>
                        <RotateCcw aria-hidden /> Retry {ds.dead} failed
                      </Button>
                    )
                  }
                />
                <CardBody className="flex flex-col gap-5">
                  <DeliveryProgress
                    total={b.candidateCount}
                    counts={{ DELIVERED: ds.delivered, SENT: ds.sent, RETRYING: ds.retrying, PENDING: Math.max(0, ds.pending - ds.retrying), DEAD: ds.dead }}
                  />
                  <dl className="grid grid-cols-2 gap-3 text-body sm:grid-cols-4">
                    {[
                      ['Certificates', ds.certificates],
                      ['Delivered', ds.delivered],
                      ['Retrying', ds.retrying],
                      ['Failed', ds.dead],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-surface-2/60 px-3 py-2">
                        <dt className="text-caption text-muted">{k}</dt>
                        <dd className="text-lg font-semibold tabular text-fg">{formatNumber(Number(v))}</dd>
                      </div>
                    ))}
                  </dl>
                </CardBody>
              </Card>
            )}
            {tab === 'timeline' && (
              <Card>
                <CardBody>
                  <Timeline batchId={b.id} />
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4" aria-label="Review">
          {reviewActions(d, user).visible && (
            <Card>
              <CardHeader title="Your decision" />
              <CardBody>
                <ActionBar detail={d} user={user} busy={busy} onAction={onAction} />
              </CardBody>
            </Card>
          )}
          <ApprovalsPanel detail={d} onWithdraw={() => setDialog('withdraw')} withdrawing={busy && dialog === 'withdraw'} />
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
                <dt className="text-muted">Centre</dt>
                <dd className="text-fg">{b.centre.name}</dd>
                <dt className="text-muted">District</dt>
                <dd className="text-fg">{b.district.name}</dd>
                <dt className="text-muted">Candidates</dt>
                <dd className="tabular text-fg">
                  {formatNumber(b.candidateCount)}
                  {d.needsQualityReview && <span className="ml-1.5 text-caption text-muted">(quality check: {d.qualityThreshold}+)</span>}
                </dd>
                <dt className="text-muted">Submitted</dt>
                <dd className="text-fg">{b.submittedAt ? <RelativeTime iso={b.submittedAt} /> : '–'}</dd>
                <dt className="text-muted">Created</dt>
                <dd className="text-fg">
                  <RelativeTime iso={b.createdAt} />
                </dd>
                {issuing && (
                  <>
                    <dt className="text-muted">Issued</dt>
                    <dd className="flex items-center gap-1 text-fg">
                      <Award className="size-3.5 text-status-green-fg" aria-hidden /> {ds.certificates} of {b.candidateCount}
                    </dd>
                  </>
                )}
                <dt className="text-muted">Batch ID</dt>
                <dd className="truncate font-mono text-caption text-muted" title={b.id}>
                  {b.id.slice(0, 8)}
                </dd>
              </dl>
            </CardBody>
          </Card>
          {user.role !== 'CENTRE' && (
            <p className="flex items-center gap-1.5 px-1 text-caption text-muted">
              <Users className="size-3.5" aria-hidden /> Everyone who can see this batch sees changes live.
            </p>
          )}
        </aside>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={dialog === 'send_back'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Send this batch back?"
        description="The centre will see your reason and can fix the batch and resubmit it. All approvals on this revision will be reset."
        confirmLabel="Send back"
        reason={{ label: 'What must the centre fix?', placeholder: 'e.g. Row 4 has the wrong passed-on date', minLength: 5 }}
        onConfirm={(reason) => decide('send_back', reason)}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Reject this batch?"
        description="Rejection is final: the centre cannot resubmit this batch and no certificates will be issued. Use “Send back” if it can be fixed."
        confirmLabel="Reject batch"
        tone="danger"
        reason={{ label: 'Why is it rejected?', minLength: 5 }}
        acknowledge="I understand this is final and cannot be undone."
        onConfirm={(reason) => decide('reject', reason)}
      />
      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Give final approval?"
        description={`This issues ${plural(b.candidateCount, 'certificate')} and sends each candidate their certificate on WhatsApp. Certificates can be revoked later, but messages can’t be unsent.`}
        confirmLabel="Approve and issue"
        onConfirm={() => decide('approve')}
      />
      <ConfirmDialog
        open={dialog === 'withdraw'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Withdraw your approval?"
        description="Your approval is removed (it stays in the audit log as withdrawn). You can approve again later."
        confirmLabel="Withdraw approval"
        onConfirm={async () => {
          setBusy(true);
          try {
            await api(`/batches/${b.id}/approvals/mine`, { method: 'DELETE' });
            notify('Approval withdrawn', 'success');
            refreshAll();
          } finally {
            setBusy(false);
          }
        }}
      />
      <ConfirmDialog
        open={dialog === 'retry'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Retry ${plural(ds.dead, 'failed delivery', 'failed deliveries')}?`}
        description="Each one is sent again as a new WhatsApp message (with a new idempotency key). The batch goes back to “Issuing” until they finish."
        confirmLabel="Retry now"
        onConfirm={async () => {
          await api(`/batches/${b.id}/deliveries/retry-dead`, { method: 'POST' });
          notify('Retrying failed deliveries', 'success');
          refreshAll();
        }}
      />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this certificate?"
        description="Public verification will show REVOKED immediately, and the download link stops working. This cannot be undone."
        confirmLabel="Revoke certificate"
        tone="danger"
        reason={{ label: 'Reason (kept private; not shown on the public page)', minLength: 5 }}
        typeToConfirm={revoking ? { value: revoking, label: 'Type the certificate number' } : undefined}
        onConfirm={async (reason) => {
          await api(`/certificates/${encodeURIComponent(revoking!)}/revoke`, { method: 'POST', json: { reason } });
          notify(`Certificate ${revoking} revoked`, 'success', 'Public verification now shows REVOKED.');
          refreshAll();
        }}
      />
    </>
  );
}
