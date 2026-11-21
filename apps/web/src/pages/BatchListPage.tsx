import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { StatusChip } from '../components/StatusChip';
import { formatDateTime } from '../format';
import { useToast } from '../toast';
import type { BatchSummary } from '../types';

export function BatchListPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [courseName, setCourseName] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['batches'], queryFn: () => api<{ batches: BatchSummary[] }>('/batches') });

  const create = useMutation({
    mutationFn: () => api<{ batch: BatchSummary }>('/batches', { method: 'POST', json: { courseName } }),
    onSuccess: ({ batch }) => {
      void qc.invalidateQueries({ queryKey: ['batches'] });
      navigate(`/batches/${batch.id}`);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <>
      <h1>{user?.role === 'CENTRE' ? 'My batches' : 'All batches'}</h1>
      {user?.role === 'CENTRE' && (
        <form
          className="card row"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="Course name, e.g. Electrician Helper" maxLength={120} />
          <button className="btn" disabled={courseName.trim().length < 3 || create.isPending}>
            Create batch
          </button>
        </form>
      )}
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Centre</th>
              <th>Candidates</th>
              <th>Status</th>
              <th>Revision</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {(data?.batches ?? []).map((b) => (
              <tr key={b.id}>
                <td>
                  <Link to={`/batches/${b.id}`}>{b.courseName}</Link>
                  {b.slaBreachedAt && <span className="chip chip-red">SLA</span>}
                </td>
                <td>{b.centre.name}</td>
                <td>{b.candidateCount}</td>
                <td>
                  <StatusChip status={b.status} />
                </td>
                <td>{b.revision || '-'}</td>
                <td>{formatDateTime(b.updatedAt)}</td>
              </tr>
            ))}
            {data?.batches.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No batches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
