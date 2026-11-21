import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { ReasonForm } from '../components/ReasonForm';
import { Badge, StatusChip } from '../components/StatusChip';
import { Timeline } from '../components/Timeline';
import { formatDate, formatDateTime, humanise } from '../format';
import { useToast } from '../toast';
import type { BatchDetail, RowError } from '../types';

type Pending = 'reject' | 'send_back' | null;

export function BatchDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Pending>(null);
  const [rowErrors, setRowErrors] = useState<RowError[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [tab, setTab] = useState<'candidates' | 'timeline'>('candidates');

  const { data, isLoading, error } = useQuery({
    queryKey: ['batch', id],
    queryFn: () => api<BatchDetail>(`/batches/${id}`),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['batch', id] });
    void qc.invalidateQueries({ queryKey: ['timeline', id] });
    void qc.invalidateQueries({ queryKey: ['batches'] });
    void qc.invalidateQueries({ queryKey: ['queue'] });
  };
  const onError = (e: unknown) => {
    if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
      toast('Someone else changed this batch a moment ago. Reloaded; please check and try again.', 'error');
      refresh();
      return;
    }
    toast((e as Error).message, 'error');
  };

  const action = useMutation({
    mutationFn: async (args: { kind: 'submit' | 'resubmit' | 'approve' | 'reject' | 'send_back' | 'withdraw' | 'retry'; reason?: string }) => {
      const version = data!.batch.version;
      switch (args.kind) {
        case 'submit':
        case 'resubmit':
          return api(`/batches/${id}/${args.kind}`, { method: 'POST', json: { version } });
        case 'withdraw':
          return api(`/batches/${id}/approvals/mine`, { method: 'DELETE' });
        case 'retry':
          return api(`/batches/${id}/deliveries/retry-dead`, { method: 'POST' });
        default:
          return api(`/batches/${id}/decisions`, {
            method: 'POST',
            headers: { 'If-Match': String(version) },
            json: { action: args.kind, ...(args.reason ? { reason: args.reason } : {}) },
          });
      }
    },
    onSuccess: (_r, args) => {
      setPending(null);
      toast(`${humanise(args.kind)}: done`, 'success');
      refresh();
    },
    onError,
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<{ imported: number }>(`/batches/${id}/candidates/import`, { method: 'POST', body: form });
    },
    onSuccess: (r) => {
      setRowErrors(null);
      toast(`Imported ${r.imported} candidates`, 'success');
      refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_SPREADSHEET') {
        setRowErrors((e.details as { errors: RowError[] }).errors);
        toast(e.message, 'error');
      } else onError(e);
    },
  });

  const revoke = useMutation({
    mutationFn: (args: { number: string; reason: string }) =>
      api(`/certificates/${encodeURIComponent(args.number)}/revoke`, { method: 'POST', json: { reason: args.reason } }),
    onSuccess: () => {
      setRevoking(null);
      toast('Certificate revoked. Public verification now shows REVOKED.', 'success');
      refresh();
    },
    onError,
  });

  if (isLoading) return <p>Loading...</p>;
  if (error || !data) return <p className="error">{(error as Error)?.message ?? 'Batch not found'}</p>;

  const { batch, allowed, districtApprovals, deliverySummary } = data;
  const currentDecisions = batch.approvals.filter((a) => a.revision === batch.revision);
  const olderDecisions = batch.approvals.filter((a) => a.revision !== batch.revision);
  const issuing = ['ISSUING', 'ISSUED', 'PARTIALLY_ISSUED'].includes(batch.status);

  return (
    <>
      <p>
        <Link to="/batches">← Batches</Link>
      </p>
      <div className="title-row">
        <h1>{batch.courseName}</h1>
        <StatusChip status={batch.status} />
        {batch.slaBreachedAt && <Badge tone="red">SLA breached</Badge>}
      </div>
      <p className="muted">
        {batch.centre.name} · {batch.district.name} district · {batch.candidateCount} candidates · revision {batch.revision || '-'} · version{' '}
        {batch.version}
      </p>

      {batch.status === 'SENT_BACK' && batch.sendBackReason && (
        <div className="card warn">
          <strong>Sent back:</strong> {batch.sendBackReason}
          <div className="muted small">Fix the spreadsheet if needed and resubmit. All earlier approvals will need to be given again.</div>
        </div>
      )}

      <section className="card">
        <h2>Review</h2>
        {['PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE'].includes(batch.status) && (
          <p>
            District approvals: <strong>{districtApprovals.count} of {districtApprovals.required}</strong>
            {districtApprovals.officers.length > 0 && <> ({districtApprovals.officers.join(', ')} approved)</>}
            {data.needsQualityReview && <> · Large batch (≥ {data.qualityThreshold}): quality review required</>}
          </p>
        )}
        {currentDecisions.length > 0 && (
          <ul className="decisions">
            {currentDecisions.map((a) => (
              <li key={a.id} className={a.withdrawnAt ? 'struck' : ''}>
                {humanise(a.step)}: <strong>{a.officer.name}</strong> {humanise(a.decision).toLowerCase()}
                {a.reason && <> - “{a.reason}”</>} <span className="muted small">{formatDateTime(a.createdAt)}</span>
                {a.withdrawnAt && <span className="muted small"> (withdrawn {formatDateTime(a.withdrawnAt)})</span>}
              </li>
            ))}
          </ul>
        )}
        {olderDecisions.length > 0 && (
          <details>
            <summary className="muted small">{olderDecisions.length} superseded decision(s) from earlier revisions</summary>
            <ul className="decisions">
              {olderDecisions.map((a) => (
                <li key={a.id} className="struck">
                  r{a.revision} {humanise(a.step)}: {a.officer.name} {humanise(a.decision).toLowerCase()} {a.reason && `- “${a.reason}”`}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="row">
          {allowed.submit && (
            <button className="btn" disabled={action.isPending || batch.candidateCount === 0} onClick={() => action.mutate({ kind: 'submit' })}>
              Submit for review
            </button>
          )}
          {allowed.resubmit && (
            <button className="btn" disabled={action.isPending} onClick={() => action.mutate({ kind: 'resubmit' })}>
              Resubmit
            </button>
          )}
          {allowed.approve && (
            <button className="btn btn-ok" disabled={action.isPending} onClick={() => action.mutate({ kind: 'approve' })}>
              {batch.status === 'PENDING_STATE' ? 'Give final approval' : 'Approve'}
            </button>
          )}
          {allowed.sendBack && (
            <button className="btn btn-ghost" onClick={() => setPending('send_back')}>
              Send back
            </button>
          )}
          {allowed.reject && (
            <button className="btn btn-danger" onClick={() => setPending('reject')}>
              Reject
            </button>
          )}
          {allowed.withdraw && (
            <button className="btn btn-ghost" disabled={action.isPending} onClick={() => action.mutate({ kind: 'withdraw' })}>
              Withdraw my approval
            </button>
          )}
          {allowed.retryDeliveries && (
            <button className="btn" disabled={action.isPending} onClick={() => action.mutate({ kind: 'retry' })}>
              Retry failed deliveries
            </button>
          )}
          {data.myActiveApproval && !allowed.withdraw && <span className="muted">You approved this batch.</span>}
          {data.myActiveApproval && batch.status === 'PENDING_DISTRICT' && (
            <span className="muted">Waiting for a second, different officer.</span>
          )}
        </div>
        {pending && (
          <ReasonForm
            label={pending === 'reject' ? 'Why is this batch rejected? (final)' : 'What must the centre fix?'}
            confirmText={pending === 'reject' ? 'Reject batch' : 'Send back'}
            danger={pending === 'reject'}
            busy={action.isPending}
            onCancel={() => setPending(null)}
            onSubmit={(reason) => action.mutate({ kind: pending as 'reject' | 'send_back', reason })}
          />
        )}
      </section>

      {allowed.edit && (
        <section className="card">
          <h2>Candidates spreadsheet</h2>
          <p className="muted small">
            CSV or XLSX with columns: full_name, phone, enrolment_id, dob (optional), score, passed_on. The whole file is checked first; nothing is saved
            unless every row is valid. Uploading replaces the current list.
          </p>
          <input
            type="file"
            accept=".csv,.xlsx"
            disabled={upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
          {rowErrors && (
            <table className="table errors">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Column</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {rowErrors.map((r, i) => (
                  <tr key={i}>
                    <td>{r.row}</td>
                    <td>
                      <code>{r.column}</code>
                    </td>
                    <td>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {issuing && (
        <section className="card">
          <h2>Issuance & WhatsApp delivery</h2>
          <div className="row">
            <Badge tone="blue">{deliverySummary.certificates} certificates</Badge>
            <Badge tone="green">{deliverySummary.delivered} delivered</Badge>
            <Badge tone="amber">{deliverySummary.sent} sent</Badge>
            <Badge tone="orange">{deliverySummary.retrying} retrying</Badge>
            <Badge tone="grey">{deliverySummary.pending} pending</Badge>
            <Badge tone="red">{deliverySummary.dead} failed</Badge>
          </div>
        </section>
      )}

      <div className="tabs">
        <button className={tab === 'candidates' ? 'active' : ''} onClick={() => setTab('candidates')}>
          Candidates ({batch.candidates.length})
        </button>
        <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>
          Timeline
        </button>
      </div>

      {tab === 'timeline' ? (
        <section className="card">
          <Timeline batchId={batch.id} />
        </section>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Enrolment</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Score</th>
              <th>Passed on</th>
              {issuing && (
                <>
                  <th>Certificate</th>
                  <th>Delivery</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {batch.candidates.map((c) => {
              const delivery = c.certificate?.deliveries[0];
              return (
                <tr key={c.id}>
                  <td>{c.enrolmentId}</td>
                  <td>{c.fullName}</td>
                  <td>{c.phone}</td>
                  <td>{c.score}</td>
                  <td>{formatDate(c.passedOn)}</td>
                  {issuing && (
                    <>
                      <td>
                        {c.certificate ? (
                          <>
                            <a href={`/verify/${c.certificate.certificateNumber}`} target="_blank" rel="noreferrer">
                              {c.certificate.certificateNumber}
                            </a>{' '}
                            {c.certificate.status === 'REVOKED' ? (
                              <Badge tone="red">Revoked</Badge>
                            ) : (
                              allowed.revoke &&
                              (revoking === c.certificate.certificateNumber ? (
                                <ReasonForm
                                  label="Reason for revocation"
                                  confirmText="Revoke"
                                  danger
                                  busy={revoke.isPending}
                                  onCancel={() => setRevoking(null)}
                                  onSubmit={(reason) => revoke.mutate({ number: c.certificate!.certificateNumber, reason })}
                                />
                              ) : (
                                <button className="btn btn-small btn-danger" onClick={() => setRevoking(c.certificate!.certificateNumber)}>
                                  Revoke
                                </button>
                              ))
                            )}
                          </>
                        ) : (
                          <span className="muted">generating...</span>
                        )}
                      </td>
                      <td>
                        {delivery ? (
                          <span title={delivery.lastError ?? ''}>
                            {humanise(delivery.status)}
                            {delivery.attempts > 1 && <span className="muted small"> ({delivery.attempts} attempts)</span>}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {user?.role === 'CENTRE' && batch.candidates.length === 0 && <p className="muted">No candidates yet. Upload a spreadsheet above.</p>}
    </>
  );
}
