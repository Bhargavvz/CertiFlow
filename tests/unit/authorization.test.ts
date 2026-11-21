/**
 * Proves: "Never - wrong actor" at the policy level. can(user, action, batch) checks
 * role, scope (centre / district) and step, as one table.
 */
import { describe, expect, it } from 'vitest';
import { can, type AuthUser, type BatchScope, type BatchStatus, type PolicyAction } from '@certiflow/shared';

const NGP = 'd1000000-0000-4000-8000-000000000001';
const AMR = 'd2000000-0000-4000-8000-000000000002';
const C_NGP = 'c1000000-0000-4000-8000-000000000001';
const C_AMR = 'c2000000-0000-4000-8000-000000000002';

const u = (role: AuthUser['role'], extra: Partial<AuthUser> = {}): AuthUser => ({
  id: `${role}-id`,
  role,
  name: role,
  centreId: null,
  districtId: null,
  ...extra,
});

const anika = u('CENTRE', { centreId: C_NGP, districtId: NGP });
const ravi = u('CENTRE', { centreId: C_AMR, districtId: AMR });
const dev = u('DISTRICT_OFFICER', { districtId: NGP });
const isha = u('DISTRICT_OFFICER', { districtId: AMR });
const neha = u('QUALITY');
const farah = u('STATE');

const batch = (status: BatchStatus): BatchScope => ({ centreId: C_NGP, districtId: NGP, status });

type Expect = 'allow' | 'FORBIDDEN' | 'INVALID_STATE' | 'NOT_FOUND';
const table: [string, AuthUser, PolicyAction, BatchStatus | null, Expect][] = [
  // creating / editing / submitting
  ['centre creates', anika, 'batch.create', null, 'allow'],
  ['officer cannot create', dev, 'batch.create', null, 'FORBIDDEN'],
  ['owner edits draft', anika, 'batch.edit', 'DRAFT', 'allow'],
  ['owner edits sent-back', anika, 'batch.edit', 'SENT_BACK', 'allow'],
  ['owner cannot edit under review', anika, 'batch.edit', 'PENDING_DISTRICT', 'INVALID_STATE'],
  ['other centre cannot edit', ravi, 'batch.edit', 'DRAFT', 'FORBIDDEN'],
  ['owner submits draft', anika, 'batch.submit', 'DRAFT', 'allow'],
  ['other centre cannot submit', ravi, 'batch.submit', 'DRAFT', 'FORBIDDEN'],
  ['owner resubmits', anika, 'batch.resubmit', 'SENT_BACK', 'allow'],
  ['officer cannot resubmit', dev, 'batch.resubmit', 'SENT_BACK', 'FORBIDDEN'],
  // viewing
  ['owner sees draft', anika, 'batch.view', 'DRAFT', 'allow'],
  ['officer does not see draft', dev, 'batch.view', 'DRAFT', 'NOT_FOUND'],
  ['officer sees own district', dev, 'batch.view', 'PENDING_DISTRICT', 'allow'],
  ['officer does not see other district', isha, 'batch.view', 'PENDING_DISTRICT', 'NOT_FOUND'],
  ['other centre does not see', ravi, 'batch.view', 'ISSUED', 'NOT_FOUND'],
  ['state sees all submitted', farah, 'batch.view', 'PENDING_DISTRICT', 'allow'],
  // approving: the right role at the right step in the right scope
  ['centre cannot approve', anika, 'batch.approve', 'PENDING_DISTRICT', 'FORBIDDEN'],
  ['district officer approves district step', dev, 'batch.approve', 'PENDING_DISTRICT', 'allow'],
  ['other district officer cannot approve', isha, 'batch.approve', 'PENDING_DISTRICT', 'FORBIDDEN'],
  ['district officer cannot approve quality step', dev, 'batch.approve', 'PENDING_QUALITY', 'FORBIDDEN'],
  ['quality approves quality step', neha, 'batch.approve', 'PENDING_QUALITY', 'allow'],
  ['quality cannot give final approval', neha, 'batch.approve', 'PENDING_STATE', 'FORBIDDEN'],
  ['quality cannot approve district step', neha, 'batch.approve', 'PENDING_DISTRICT', 'FORBIDDEN'],
  ['state gives final approval', farah, 'batch.approve', 'PENDING_STATE', 'allow'],
  ['state cannot skip district approval', farah, 'batch.approve', 'PENDING_DISTRICT', 'FORBIDDEN'],
  ['approving a draft is a state error for a reviewer', dev, 'batch.approve', 'SENT_BACK', 'INVALID_STATE'],
  ['centre approving a draft is forbidden', anika, 'batch.approve', 'DRAFT', 'FORBIDDEN'],
  // send back / reject
  ['officer sends back at district', dev, 'batch.send_back', 'PENDING_DISTRICT', 'allow'],
  ['officer cannot send back after district', dev, 'batch.send_back', 'PENDING_STATE', 'FORBIDDEN'],
  ['state can send back at any review step', farah, 'batch.send_back', 'PENDING_QUALITY', 'allow'],
  ['state can reject at district step', farah, 'batch.reject', 'PENDING_DISTRICT', 'allow'],
  ['quality rejects at quality step', neha, 'batch.reject', 'PENDING_QUALITY', 'allow'],
  // withdrawals
  ['officer withdraws at district step', dev, 'approval.withdraw', 'PENDING_DISTRICT', 'allow'],
  ['officer cannot withdraw once moved on', dev, 'approval.withdraw', 'PENDING_STATE', 'INVALID_STATE'],
  ['other district cannot withdraw', isha, 'approval.withdraw', 'PENDING_DISTRICT', 'FORBIDDEN'],
  // state-only
  ['state revokes', farah, 'certificate.revoke', null, 'allow'],
  ['quality cannot revoke', neha, 'certificate.revoke', null, 'FORBIDDEN'],
  ['centre cannot see dashboard', anika, 'state.dashboard', null, 'FORBIDDEN'],
];

describe('authorization policy', () => {
  it.each(table)('%s', (_name, user, action, status, expected) => {
    const decision = can(user, action, status ? batch(status) : undefined);
    if (expected === 'allow') expect(decision.allowed).toBe(true);
    else expect(decision).toMatchObject({ allowed: false, code: expected });
  });
});
