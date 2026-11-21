import type { ReactNode } from 'react';
import { STATUS_LABELS, type BatchStatus } from '@certiflow/shared';

const TONE: Record<BatchStatus, string> = {
  DRAFT: 'grey',
  PENDING_DISTRICT: 'amber',
  PENDING_QUALITY: 'amber',
  PENDING_STATE: 'amber',
  SENT_BACK: 'orange',
  REJECTED: 'red',
  APPROVED: 'blue',
  ISSUING: 'blue',
  ISSUED: 'green',
  PARTIALLY_ISSUED: 'orange',
};

export function StatusChip({ status }: { status: BatchStatus }) {
  return <span className={`chip chip-${TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}
