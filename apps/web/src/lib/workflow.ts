// Workflow helpers shared by screens. Thresholds come from GET /meta (server
// config), never from constants here, so the UI can't drift from the rules.
import type { Tone } from '../design/status';
import { formatDuration } from '../format';
import type { BatchStatus, Meta } from '../types';

/** Does a batch of this size need the quality step? Unknown until /meta has loaded. */
export function needsQuality(candidateCount: number, meta: Meta | undefined): boolean {
  return meta ? candidateCount >= meta.qualityThreshold : false;
}

/** Who a batch is waiting on, in plain words. */
export function whoHasIt(status: BatchStatus, districtName?: string): string {
  switch (status) {
    case 'DRAFT':
    case 'SENT_BACK':
      return 'Training centre';
    case 'PENDING_DISTRICT':
      return districtName ? `${districtName} district officers` : 'District officers';
    case 'PENDING_QUALITY':
      return 'Quality team';
    case 'PENDING_STATE':
      return 'State office';
    default:
      return 'System';
  }
}

export interface SlaState {
  tone: Extract<Tone, 'green' | 'amber' | 'red'>;
  label: string;
  /** Seconds until breach (negative once breached). */
  remaining: number;
}

/**
 * SLA traffic light: green while plenty of time is left, amber in the last quarter,
 * red once breached (by the clock, or because the server already flagged it).
 */
export function slaState(enteredAt: string | null, slaSeconds: number, breachedAt: string | null, now = Date.now()): SlaState | null {
  if (!enteredAt) return null;
  const remaining = Math.round((new Date(enteredAt).getTime() + slaSeconds * 1000 - now) / 1000);
  if (breachedAt || remaining <= 0) return { tone: 'red', label: `Overdue by ${formatDuration(-remaining)}`, remaining };
  if (remaining < slaSeconds / 4) return { tone: 'amber', label: `Breaches in ${formatDuration(remaining)}`, remaining };
  return { tone: 'green', label: `Breaches in ${formatDuration(remaining)}`, remaining };
}

export const IN_REVIEW: BatchStatus[] = ['PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE'];
