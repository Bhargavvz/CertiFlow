import { STATUS_LABELS } from '@certiflow/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Badge } from '../components/StatusChip';
import { formatAge, formatDateTime } from '../format';
import type { StuckItem } from '../types';

/** State office SLA dashboard. Breaches arrive in realtime from the sla.check job. */
export function StuckPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stuck'],
    queryFn: () => api<{ slaSeconds: number; slaSource: string; breached: StuckItem[]; waiting: StuckItem[] }>('/state/stuck'),
    refetchInterval: 30_000,
  });
  if (isLoading || !data) return <p>Loading...</p>;

  const table = (items: StuckItem[]) => (
    <table className="table">
      <thead>
        <tr>
          <th>Course</th>
          <th>Centre</th>
          <th>Step</th>
          <th>Waiting since</th>
          <th>Age</th>
          <th>Overdue</th>
        </tr>
      </thead>
      <tbody>
        {items.map((b) => (
          <tr key={b.id} className={b.breached ? 'row-breached' : ''}>
            <td>
              <Link to={`/batches/${b.id}`}>{b.courseName}</Link>
            </td>
            <td>
              {b.centre.name} <span className="muted small">({b.district.name})</span>
            </td>
            <td>{STATUS_LABELS[b.status]}</td>
            <td>{formatDateTime(b.currentStepEnteredAt)}</td>
            <td>{formatAge(b.ageSeconds)}</td>
            <td>{b.breached ? <Badge tone="red">{formatAge(b.overdueSeconds)}</Badge> : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <h1>Stuck batches</h1>
      <p className="muted">
        SLA: {formatAge(data.slaSeconds)} per review step{data.slaSource === 'override' && ' (demo override)'}. Breaches escalate here
        automatically.
      </p>
      <h2>SLA breached ({data.breached.length})</h2>
      {data.breached.length ? table(data.breached) : <p className="card">No breaches.</p>}
      <h2>Everything waiting, oldest first ({data.waiting.length})</h2>
      {table(data.waiting)}
    </>
  );
}
