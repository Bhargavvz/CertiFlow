import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ReasonForm } from '../components/ReasonForm';
import { Badge } from '../components/StatusChip';
import { formatDate, humanise } from '../format';
import { useToast } from '../toast';
import type { CertificateSearchRow } from '../types';

/** State office: find any certificate and revoke it. */
export function CertificatesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['certificates', search],
    queryFn: () => api<{ certificates: CertificateSearchRow[] }>(`/certificates?q=${encodeURIComponent(search)}`),
  });

  const revoke = useMutation({
    mutationFn: (args: { number: string; reason: string }) =>
      api(`/certificates/${encodeURIComponent(args.number)}/revoke`, { method: 'POST', json: { reason: args.reason } }),
    onSuccess: () => {
      setRevoking(null);
      toast('Certificate revoked', 'success');
      void qc.invalidateQueries({ queryKey: ['certificates'] });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <>
      <h1>Certificates</h1>
      <form
        className="card row"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Certificate number or candidate name" />
        <button className="btn">Search</button>
      </form>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Candidate</th>
              <th>Course / centre</th>
              <th>Issued</th>
              <th>Delivery</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.certificates ?? []).map((c) => (
              <tr key={c.certificateNumber}>
                <td>
                  <a href={`/verify/${c.certificateNumber}`} target="_blank" rel="noreferrer">
                    {c.certificateNumber}
                  </a>
                </td>
                <td>
                  {c.candidate.fullName} <span className="muted small">{c.candidate.enrolmentId}</span>
                </td>
                <td>
                  <Link to={`/batches/${c.batchId}`}>{c.batch.courseName}</Link>
                  <div className="muted small">{c.batch.centre.name}</div>
                </td>
                <td>{formatDate(c.issuedAt)}</td>
                <td>{c.deliveries[0] ? humanise(c.deliveries[0].status) : '-'}</td>
                <td>
                  {c.status === 'REVOKED' ? (
                    <span title={c.revokeReason ?? ''}>
                      <Badge tone="red">Revoked</Badge>
                    </span>
                  ) : revoking === c.certificateNumber ? (
                    <ReasonForm
                      label="Reason for revocation"
                      confirmText="Revoke"
                      danger
                      busy={revoke.isPending}
                      onCancel={() => setRevoking(null)}
                      onSubmit={(reason) => revoke.mutate({ number: c.certificateNumber, reason })}
                    />
                  ) : (
                    <>
                      <Badge tone="green">Valid</Badge>{' '}
                      <button className="btn btn-small btn-danger" onClick={() => setRevoking(c.certificateNumber)}>
                        Revoke
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
