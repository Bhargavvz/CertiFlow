// The single source of truth for batch lifecycle transitions. Every status change
// in the system is computed here; services only persist the result. Pure functions,
// so the whole table is unit-tested without a database.
import type { BatchStatus, ReviewStep, Role } from './types';

export type BatchAction =
  | 'submit'
  | 'resubmit'
  | 'approve'
  | 'reject'
  | 'send_back'
  | 'start_issuing'
  | 'finish_issuing'
  | 'retry_deliveries';

export interface TransitionContext {
  /** Live district approvals for the current revision, INCLUDING the one being recorded. */
  districtApprovals?: number;
  candidateCount?: number;
  qualityThreshold?: number;
  /** For finish_issuing: did every certificate reach DELIVERED? */
  allDelivered?: boolean;
}

export const REQUIRED_DISTRICT_APPROVALS = 2;

export const REVIEW_STATES = ['PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE'] as const;
export const TERMINAL_STATES: readonly BatchStatus[] = ['REJECTED', 'ISSUED'];

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: BatchStatus,
    public readonly action: BatchAction,
  ) {
    super(`Cannot ${action.replace('_', ' ')} a batch that is ${from}`);
    this.name = 'IllegalTransitionError';
  }
}

export function isReviewState(status: string): status is (typeof REVIEW_STATES)[number] {
  return (REVIEW_STATES as readonly string[]).includes(status);
}

export function stepForStatus(status: BatchStatus): ReviewStep | null {
  switch (status) {
    case 'PENDING_DISTRICT':
      return 'DISTRICT';
    case 'PENDING_QUALITY':
      return 'QUALITY';
    case 'PENDING_STATE':
      return 'STATE';
    default:
      return null;
  }
}

export function roleForStep(step: ReviewStep): Role {
  return step === 'DISTRICT' ? 'DISTRICT_OFFICER' : step;
}

export function needsQualityReview(candidateCount: number, threshold: number): boolean {
  return candidateCount >= threshold;
}

/**
 * Returns the next status, or throws IllegalTransitionError.
 * A result equal to `from` is legal (e.g. first of two district approvals).
 */
export function transition(from: BatchStatus, action: BatchAction, ctx: TransitionContext = {}): BatchStatus {
  switch (from) {
    case 'DRAFT':
      if (action === 'submit') return 'PENDING_DISTRICT';
      break;

    case 'SENT_BACK':
      if (action === 'resubmit') return 'PENDING_DISTRICT';
      break;

    case 'PENDING_DISTRICT':
      if (action === 'approve') {
        if (ctx.districtApprovals === undefined) throw new Error('districtApprovals is required to approve at district');
        if (ctx.districtApprovals < REQUIRED_DISTRICT_APPROVALS) return 'PENDING_DISTRICT';
        if (ctx.candidateCount === undefined || ctx.qualityThreshold === undefined) {
          throw new Error('candidateCount and qualityThreshold are required to leave the district step');
        }
        return needsQualityReview(ctx.candidateCount, ctx.qualityThreshold) ? 'PENDING_QUALITY' : 'PENDING_STATE';
      }
      if (action === 'send_back') return 'SENT_BACK';
      if (action === 'reject') return 'REJECTED';
      break;

    case 'PENDING_QUALITY':
      if (action === 'approve') return 'PENDING_STATE';
      if (action === 'send_back') return 'SENT_BACK';
      if (action === 'reject') return 'REJECTED';
      break;

    case 'PENDING_STATE':
      if (action === 'approve') return 'APPROVED';
      if (action === 'send_back') return 'SENT_BACK';
      if (action === 'reject') return 'REJECTED';
      break;

    case 'APPROVED':
      if (action === 'start_issuing') return 'ISSUING';
      break;

    case 'ISSUING':
      if (action === 'finish_issuing') return ctx.allDelivered ? 'ISSUED' : 'PARTIALLY_ISSUED';
      break;

    case 'PARTIALLY_ISSUED':
      // A late "delivered" webhook can complete a partially issued batch.
      if (action === 'finish_issuing') return ctx.allDelivered ? 'ISSUED' : 'PARTIALLY_ISSUED';
      if (action === 'retry_deliveries') return 'ISSUING';
      break;

    case 'REJECTED':
    case 'ISSUED':
      break;
  }
  throw new IllegalTransitionError(from, action);
}
