import { ROLE_LABELS } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, StatusChip } from '../components/StatusChip';
import { formatAge, formatDateTime } from '../format';
import type { QueueItem } from '../types';

/** "Waiting for me": oldest first, with age and SLA due time. */
export function QueuePage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['queue'],
    queryFn: () => api<{ items: QueueItem[] }>('/queue'),
    refetchInterval: 30_000, // keeps the "age" column fresh; changes arrive via websocket
  });
  const items = data?.items ?? [];

  return (
    <>
      <h1>{user?.role === 'STATE' ? 'Final approval queue' : 'Waiting for me'}</h1>
      <p className="muted">{user && ROLE_LABELS[user.role]} · oldest first</p>
      {isLoading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p className="card">Nothing is waiting for you.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Centre</th>
              <th>Candidates</th>
              <th>Status</th>
              <th>Waiting</th>
              <th>SLA due</th>
              {user?.role === 'DISTRICT_OFFICER' && <th>Approvals</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td>
                  <Link to={`/batches/${b.id}`}>{b.courseName}</Link>
                </td>
                <td>{b.centre.name}</td>
                <td>{b.candidateCount}</td>
                <td>
                  <StatusChip status={b.status} />
                </td>
                <td>{formatAge(b.ageSeconds)}</td>
                <td>{b.slaBreachedAt ? <Badge tone="red">Breached</Badge> : formatDateTime(b.slaDueAt)}</td>
                {user?.role === 'DISTRICT_OFFICER' && (
                  <td>
                    {b.districtApprovals} of 2 {b.iApproved && <Badge tone="green">you approved</Badge>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
