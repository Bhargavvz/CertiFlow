// Central authorization policy: can(user, action, batch).
// Checks role AND scope (centre owns batch / officer's district matches) AND that
// the batch is at a step where this role may act. Pure, unit-tested as a table.
import { roleForStep, stepForStatus } from './batchStateMachine';
import type { AuthUser, BatchStatus } from './types';

export type PolicyAction =
  | 'batch.create'
  | 'batch.view'
  | 'batch.edit'
  | 'batch.submit'
  | 'batch.resubmit'
  | 'batch.approve'
  | 'batch.reject'
  | 'batch.send_back'
  | 'approval.withdraw'
  | 'certificate.revoke'
  | 'certificate.search'
  | 'state.dashboard'
  | 'delivery.retry'
  | 'queues.admin';

/** The only batch fields the policy needs. */
export interface BatchScope {
  centreId: string;
  districtId: string;
  status: BatchStatus;
}

export type PolicyDenyCode = 'FORBIDDEN' | 'INVALID_STATE' | 'NOT_FOUND';
export type PolicyDecision = { allowed: true } | { allowed: false; code: PolicyDenyCode; reason: string };

const ALLOW: PolicyDecision = { allowed: true };
const deny = (code: PolicyDenyCode, reason: string): PolicyDecision => ({ allowed: false, code, reason });

const STATE_ONLY: PolicyAction[] = ['certificate.revoke', 'certificate.search', 'state.dashboard', 'delivery.retry', 'queues.admin'];

/** Is the batch inside the user's jurisdiction at all? */
export function inScope(user: AuthUser, batch: BatchScope): boolean {
  switch (user.role) {
    case 'CENTRE':
      return user.centreId !== null && user.centreId === batch.centreId;
    case 'DISTRICT_OFFICER':
      return user.districtId !== null && user.districtId === batch.districtId;
    case 'QUALITY':
    case 'STATE':
      return true;
  }
}

export function can(user: AuthUser, action: PolicyAction, batch?: BatchScope): PolicyDecision {
  if (action === 'batch.create') {
    return user.role === 'CENTRE' && user.centreId ? ALLOW : deny('FORBIDDEN', 'Only a training centre can create batches');
  }
  if (STATE_ONLY.includes(action)) {
    return user.role === 'STATE' ? ALLOW : deny('FORBIDDEN', 'Only the State office can do this');
  }
  if (!batch) throw new Error(`Policy action ${action} needs a batch`);

  const scoped = inScope(user, batch);

  switch (action) {
    case 'batch.view': {
      // Drafts are private to the centre that is preparing them.
      const visible = scoped && (user.role === 'CENTRE' || batch.status !== 'DRAFT');
      return visible ? ALLOW : deny('NOT_FOUND', 'Batch not found');
    }

    case 'batch.edit':
      if (user.role !== 'CENTRE' || !scoped) return deny('FORBIDDEN', 'Only the owning centre can edit this batch');
      if (batch.status !== 'DRAFT' && batch.status !== 'SENT_BACK') {
        return deny('INVALID_STATE', 'A batch can only be edited while it is a draft or has been sent back');
      }
      return ALLOW;

    case 'batch.submit':
      if (user.role !== 'CENTRE' || !scoped) return deny('FORBIDDEN', 'Only the owning centre can submit this batch');
      if (batch.status !== 'DRAFT') return deny('INVALID_STATE', 'Only a draft can be submitted');
      return ALLOW;

    case 'batch.resubmit':
      if (user.role !== 'CENTRE' || !scoped) return deny('FORBIDDEN', 'Only the owning centre can resubmit this batch');
      if (batch.status !== 'SENT_BACK') return deny('INVALID_STATE', 'Only a sent-back batch can be resubmitted');
      return ALLOW;

    case 'batch.approve':
      return reviewDecision(user, batch, scoped, false);

    case 'batch.reject':
    case 'batch.send_back':
      // The State office handles escalations, so it may stop a batch at any review step.
      return reviewDecision(user, batch, scoped, true);

    case 'approval.withdraw':
      if (user.role !== 'DISTRICT_OFFICER' || !scoped) return deny('FORBIDDEN', 'Only a district officer of this district can withdraw an approval');
      if (batch.status !== 'PENDING_DISTRICT') {
        return deny('INVALID_STATE', 'The batch has already left the district step; only the State office can send it back now');
      }
      return ALLOW;

    default:
      return deny('FORBIDDEN', 'Not allowed');
  }
}

function reviewDecision(user: AuthUser, batch: BatchScope, scoped: boolean, stateMayOverride: boolean): PolicyDecision {
  const step = stepForStatus(batch.status);
  if (!step) {
    const isReviewer = user.role !== 'CENTRE' && scoped;
    return isReviewer
      ? deny('INVALID_STATE', `The batch is ${batch.status} and is not waiting for a review decision`)
      : deny('FORBIDDEN', 'You cannot review this batch');
  }
  if (user.role === roleForStep(step) && scoped) return ALLOW;
  if (stateMayOverride && user.role === 'STATE') return ALLOW;
  return deny('FORBIDDEN', `A ${user.role} user cannot act at the ${step} step of this batch`);
}
