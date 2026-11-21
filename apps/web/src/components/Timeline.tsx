import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { formatDateTime, humanise } from '../format';
import type { TimelineItem } from '../types';

/** Full audit trail of a batch: decisions, issuance, every delivery attempt. */
export function Timeline({ batchId }: { batchId: string }) {
  const [showAttempts, setShowAttempts] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['timeline', batchId],
    queryFn: () => api<{ items: TimelineItem[] }>(`/batches/${batchId}/timeline`),
  });
  if (isLoading) return <p>Loading timeline...</p>;
  const items = (data?.items ?? []).filter((i) => showAttempts || i.kind === 'audit');
  const attempts = (data?.items ?? []).filter((i) => i.kind === 'delivery_attempt').length;

  return (
    <div>
      {attempts > 0 && (
        <label className="inline-check">
          <input type="checkbox" checked={showAttempts} onChange={(e) => setShowAttempts(e.target.checked)} /> Show {attempts} WhatsApp delivery
          attempts
        </label>
      )}
      <ol className="timeline">
        {items.map((i, idx) => (
          <li key={idx} className={i.kind === 'delivery_attempt' ? 'tl-attempt' : ''}>
            <div className="tl-head">
              <strong>{humanise(i.action)}</strong>
              {i.fromState && i.toState && i.fromState !== i.toState && (
                <span className="muted">
                  {' '}
                  {humanise(i.fromState)} → {humanise(i.toState)}
                </span>
              )}
            </div>
            <div className="muted small">
              {formatDateTime(i.at)} · {i.actorName ?? humanise(i.actorRole)}
              {i.entityType !== 'BATCH' && typeof i.metadata?.certificateNumber === 'string' && ` · ${i.metadata.certificateNumber}`}
              {i.correlationId && <span title="Correlation id"> · {i.correlationId.slice(0, 8)}</span>}
            </div>
            {i.reason && <div className="tl-reason">“{i.reason}”</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}
