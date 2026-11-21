/**
 * Proves: the batch lifecycle (Section 3) as a transition table, including the
 * 2-officer rule, the large-batch quality step, and that illegal transitions throw.
 */
import { describe, expect, it } from 'vitest';
import { IllegalTransitionError, transition, type BatchAction, type BatchStatus, type TransitionContext } from '@certiflow/shared';

const T = 50; // quality threshold
const small = { candidateCount: 10, qualityThreshold: T };
const large = { candidateCount: 60, qualityThreshold: T };

const legal: [BatchStatus, BatchAction, TransitionContext, BatchStatus][] = [
  ['DRAFT', 'submit', {}, 'PENDING_DISTRICT'],
  ['SENT_BACK', 'resubmit', {}, 'PENDING_DISTRICT'],
  ['PENDING_DISTRICT', 'approve', { districtApprovals: 1, ...small }, 'PENDING_DISTRICT'],
  ['PENDING_DISTRICT', 'approve', { districtApprovals: 2, ...small }, 'PENDING_STATE'],
  ['PENDING_DISTRICT', 'approve', { districtApprovals: 2, ...large }, 'PENDING_QUALITY'],
  ['PENDING_DISTRICT', 'approve', { districtApprovals: 2, candidateCount: 50, qualityThreshold: T }, 'PENDING_QUALITY'],
  ['PENDING_DISTRICT', 'approve', { districtApprovals: 2, candidateCount: 49, qualityThreshold: T }, 'PENDING_STATE'],
  ['PENDING_DISTRICT', 'send_back', {}, 'SENT_BACK'],
  ['PENDING_DISTRICT', 'reject', {}, 'REJECTED'],
  ['PENDING_QUALITY', 'approve', {}, 'PENDING_STATE'],
  ['PENDING_QUALITY', 'send_back', {}, 'SENT_BACK'],
  ['PENDING_QUALITY', 'reject', {}, 'REJECTED'],
  ['PENDING_STATE', 'approve', {}, 'APPROVED'],
  ['PENDING_STATE', 'send_back', {}, 'SENT_BACK'],
  ['PENDING_STATE', 'reject', {}, 'REJECTED'],
  ['APPROVED', 'start_issuing', {}, 'ISSUING'],
  ['ISSUING', 'finish_issuing', { allDelivered: true }, 'ISSUED'],
  ['ISSUING', 'finish_issuing', { allDelivered: false }, 'PARTIALLY_ISSUED'],
  ['PARTIALLY_ISSUED', 'finish_issuing', { allDelivered: true }, 'ISSUED'],
  ['PARTIALLY_ISSUED', 'retry_deliveries', {}, 'ISSUING'],
];

const illegal: [BatchStatus, BatchAction][] = [
  ['DRAFT', 'approve'],
  ['DRAFT', 'resubmit'],
  ['PENDING_DISTRICT', 'submit'],
  ['PENDING_DISTRICT', 'resubmit'],
  ['PENDING_STATE', 'submit'],
  ['SENT_BACK', 'approve'],
  ['SENT_BACK', 'submit'],
  ['REJECTED', 'resubmit'],
  ['REJECTED', 'approve'],
  ['APPROVED', 'approve'],
  ['APPROVED', 'send_back'],
  ['ISSUED', 'send_back'],
  ['ISSUED', 'start_issuing'],
  ['ISSUING', 'start_issuing'],
];

describe('batch state machine', () => {
  it.each(legal)('%s --%s--> %s', (from, action, ctx, to) => {
    expect(transition(from, action, ctx)).toBe(to);
  });

  it.each(illegal)('%s cannot %s', (from, action) => {
    expect(() => transition(from, action, { districtApprovals: 2, ...small, allDelivered: true })).toThrow(IllegalTransitionError);
  });

  it('refuses to decide a district approval without knowing the approval count', () => {
    expect(() => transition('PENDING_DISTRICT', 'approve', small)).toThrow(/districtApprovals/);
  });
});
