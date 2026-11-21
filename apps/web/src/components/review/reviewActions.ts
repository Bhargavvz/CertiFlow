// What the review action bar shows for this user on this batch. The server decides
// what is allowed (detail.allowed, computed by the same can() policy that guards the
// API); this only turns it into visible buttons and plain-language reasons.
import { isReviewState } from '@certiflow/shared';
import { whoHasIt } from '../../lib/workflow';
import type { AuthUser, BatchDetail } from '../../types';

export interface ActionState {
  enabled: boolean;
  /** Why it's disabled (shown in a tooltip). */
  reason?: string;
}

export interface ReviewActions {
  /** Show the action bar at all? */
  visible: boolean;
  approve: ActionState & { label: string; final: boolean };
  sendBack: ActionState;
  reject: ActionState;
  withdraw: ActionState & { visible: boolean };
  /** A one-line status for the panel ("Waiting for a second officer", ...). */
  note?: string;
}

export function reviewActions(detail: BatchDetail, user: AuthUser): ReviewActions {
  const { batch: b, allowed, districtApprovals } = detail;
  const inReview = isReviewState(b.status);
  const reviewer = user.role !== 'CENTRE';
  const final = b.status === 'PENDING_STATE';
  const label = final ? 'Give final approval' : 'Approve';
  const withHolder = whoHasIt(b.status, b.district.name);

  // Visible only to reviewers while the batch is in review, and only if they can do
  // something here or have already done their part (so they see why not).
  const canDecide = allowed.approve || allowed.sendBack || allowed.reject || detail.myActiveApproval;
  const visible = reviewer && inReview && canDecide;

  let approveReason: string | undefined;
  if (!allowed.approve) {
    approveReason = detail.myActiveApproval
      ? 'You already approved this revision. A second, different officer must approve.'
      : user.role === 'STATE' && b.status !== 'PENDING_STATE'
        ? `The State office approves last. This batch is with the ${withHolder.toLowerCase()} now.`
        : `This batch is waiting for ${withHolder.toLowerCase()}.`;
  }

  const decideReason = (ok: boolean) =>
    ok ? undefined : detail.myActiveApproval ? 'Withdraw your approval first if you’ve changed your mind.' : `Only ${withHolder.toLowerCase()} can decide at this step.`;

  let note: string | undefined;
  if (b.status === 'PENDING_DISTRICT') {
    note =
      districtApprovals.count === 0
        ? `Needs ${districtApprovals.required} approvals from different officers.`
        : detail.myActiveApproval
          ? 'You approved. Waiting for a second officer.'
          : `${districtApprovals.officers.join(', ')} approved. Yours would be approval ${districtApprovals.count + 1} of ${districtApprovals.required}.`;
  } else if (b.status === 'PENDING_QUALITY') {
    note = `Large batch (${detail.qualityThreshold}+ candidates): quality check before final approval.`;
  } else if (final) {
    note = `Final approval issues ${b.candidateCount} certificates and sends them on WhatsApp.`;
  }

  return {
    visible,
    approve: { enabled: allowed.approve, reason: approveReason, label, final },
    sendBack: { enabled: allowed.sendBack, reason: decideReason(allowed.sendBack) },
    reject: { enabled: allowed.reject, reason: decideReason(allowed.reject) },
    withdraw: {
      visible: detail.myActiveApproval,
      enabled: allowed.withdraw,
      reason: allowed.withdraw ? undefined : 'The batch has moved past the district step. Only the State office can send it back now.',
    },
    note,
  };
}
