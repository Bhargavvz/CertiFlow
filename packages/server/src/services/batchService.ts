// Batch workflow: create, import, submit, review decisions, withdraw, resubmit,
// plus the read models (list, detail, queue, timeline).
import type { Batch, Prisma } from '@prisma/client';
import {
  REQUIRED_DISTRICT_APPROVALS,
  can,
  needsQualityReview,
  stepForStatus,
  transition,
  type AuthUser,
  type BatchStatus,
  type CandidateInput,
  type DecisionAction,
  type PolicyAction,
} from '@certiflow/shared';
import { actorOf, writeAudit } from '../audit';
import { getConfig, slaMs } from '../config';
import { isUniqueViolation, prisma, type Tx } from '../db';
import { Errors, assertAllowed } from '../errors';
import { addOutboxEvent } from '../outbox';
import { applyTransition } from './transitions';

const DECISION_POLICY: Record<DecisionAction, PolicyAction> = {
  approve: 'batch.approve',
  reject: 'batch.reject',
  send_back: 'batch.send_back',
};
const DECISION_ENUM = { approve: 'APPROVE', reject: 'REJECT', send_back: 'SEND_BACK' } as const;

/** Active = counts toward the current decision (not withdrawn, not superseded). */
const ACTIVE_DISTRICT_APPROVAL = (batchId: string, revision: number): Prisma.ApprovalWhereInput => ({
  batchId,
  revision,
  step: 'DISTRICT',
  decision: 'APPROVE',
  superseded: false,
  withdrawnAt: null,
});

async function loadBatch(tx: Tx, batchId: string): Promise<Batch> {
  const batch = await tx.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw Errors.notFound('Batch not found');
  return batch;
}

function checkExpectedVersion(batch: Batch, expected: number | undefined) {
  if (expected !== undefined && expected !== batch.version) {
    throw Errors.conflict('VERSION_CONFLICT', 'This batch was changed by someone else. Reload and try again.', {
      expectedVersion: expected,
      currentVersion: batch.version,
    });
  }
}

// ---------------------------------------------------------------- commands

export async function createBatch(user: AuthUser, input: { courseName: string }): Promise<Batch> {
  assertAllowed(can(user, 'batch.create'));
  return prisma.$transaction(async (tx) => {
    const centre = await tx.trainingCentre.findUniqueOrThrow({ where: { id: user.centreId! } });
    const batch = await tx.batch.create({
      data: {
        courseName: input.courseName,
        centreId: centre.id,
        districtId: centre.districtId,
        createdById: user.id,
      },
    });
    await writeAudit(tx, { actor: actorOf(user), action: 'BATCH_CREATED', entityType: 'BATCH', entityId: batch.id, toState: 'DRAFT', metadata: { courseName: input.courseName } });
    await addOutboxEvent(tx, 'BatchCreated', { batchId: batch.id, centreId: batch.centreId, districtId: batch.districtId, toState: 'DRAFT', courseName: batch.courseName });
    return batch;
  });
}

export async function updateBatch(user: AuthUser, batchId: string, input: { courseName: string }): Promise<Batch> {
  return prisma.$transaction(async (tx) => {
    const batch = await loadBatch(tx, batchId);
    assertAllowed(can(user, 'batch.edit', batch));
    return applyTransition(tx, batch, {
      to: batch.status,
      actor: actorOf(user),
      auditAction: 'BATCH_UPDATED',
      event: 'BatchUpdated',
      data: { courseName: input.courseName },
      auditMetadata: { courseName: { from: batch.courseName, to: input.courseName } },
    });
  });
}

/** Cheap pre-check before parsing an upload, so outsiders learn nothing from validation errors. */
export async function assertCanEdit(user: AuthUser, batchId: string): Promise<void> {
  const batch = await loadBatch(prisma, batchId);
  assertAllowed(can(user, 'batch.edit', batch));
}

/** All-or-nothing replace of the candidate list. Validation happened before this call. */
export async function importCandidates(user: AuthUser, batchId: string, candidates: CandidateInput[], fileName: string): Promise<Batch> {
  return prisma.$transaction(async (tx) => {
    const batch = await loadBatch(tx, batchId);
    assertAllowed(can(user, 'batch.edit', batch));
    const removed = await tx.candidate.deleteMany({ where: { batchId } });
    await tx.candidate.createMany({
      data: candidates.map((c) => ({
        batchId,
        fullName: c.fullName,
        phone: c.phone,
        enrolmentId: c.enrolmentId,
        dob: c.dob ? new Date(`${c.dob}T00:00:00Z`) : null,
        score: c.score,
        passedOn: new Date(`${c.passedOn}T00:00:00Z`),
      })),
    });
    return applyTransition(tx, batch, {
      to: batch.status,
      actor: actorOf(user),
      auditAction: 'CANDIDATES_IMPORTED',
      event: 'CandidatesImported',
      data: { candidateCount: candidates.length },
      auditMetadata: { fileName, imported: candidates.length, replaced: removed.count },
      eventExtra: { candidateCount: candidates.length },
    });
  });
}

export async function submitBatch(user: AuthUser, batchId: string, expectedVersion?: number): Promise<Batch> {
  return prisma.$transaction(async (tx) => {
    const batch = await loadBatch(tx, batchId);
    assertAllowed(can(user, 'batch.submit', batch));
    checkExpectedVersion(batch, expectedVersion);
    if (batch.candidateCount === 0) throw Errors.unprocessable('NO_CANDIDATES', 'Upload the candidate spreadsheet before submitting');
    return applyTransition(tx, batch, {
      to: transition(batch.status, 'submit'),
      actor: actorOf(user),
      auditAction: 'BATCH_SUBMITTED',
      event: 'BatchSubmitted',
      data: { revision: 1, submittedAt: new Date() },
      eventExtra: { resubmission: false, candidateCount: batch.candidateCount },
    });
  });
}

/**
 * Moment 6 rule (docs/DECISIONS.md D6): resubmission supersedes ALL earlier
 * decisions (kept, never deleted), bumps the revision and restarts at the district step.
 */
export async function resubmitBatch(user: AuthUser, batchId: string, expectedVersion?: number): Promise<Batch> {
  return prisma.$transaction(async (tx) => {
    const batch = await loadBatch(tx, batchId);
    assertAllowed(can(user, 'batch.resubmit', batch));
    checkExpectedVersion(batch, expectedVersion);
    if (batch.candidateCount === 0) throw Errors.unprocessable('NO_CANDIDATES', 'The batch has no candidates');

    const superseded = await tx.approval.updateMany({ where: { batchId, superseded: false }, data: { superseded: true } });
    await writeAudit(tx, {
      actor: actorOf(user),
      action: 'APPROVALS_SUPERSEDED',
      entityType: 'BATCH',
      entityId: batchId,
      fromState: batch.status,
      toState: batch.status,
      metadata: { count: superseded.count, revision: batch.revision },
    });
    return applyTransition(tx, batch, {
      to: transition(batch.status, 'resubmit'),
      actor: actorOf(user),
      auditAction: 'BATCH_RESUBMITTED',
      event: 'BatchSubmitted',
      data: { revision: batch.revision + 1, submittedAt: new Date(), sendBackReason: null },
      auditMetadata: { supersededDecisions: superseded.count, previousRevision: batch.revision },
      eventExtra: { resubmission: true, supersededDecisions: superseded.count },
    });
  });
}

export interface DecisionInput {
  action: DecisionAction;
  reason?: string;
  version?: number;
}

/** approve / reject / send_back at whatever review step the batch is in. */
export async function decide(user: AuthUser, batchId: string, input: DecisionInput): Promise<Batch> {
  if (input.version === undefined) {
    throw Errors.preconditionRequired('Send the batch version you reviewed (If-Match header or "version" in the body)');
  }
  const cfg = getConfig();

  return prisma.$transaction(async (tx) => {
    const batch = await loadBatch(tx, batchId);
    // Identity and role come only from the verified token (user), never the body.
    assertAllowed(can(user, DECISION_POLICY[input.action], batch));
    checkExpectedVersion(batch, input.version);

    const step = stepForStatus(batch.status)!;

    if (input.action === 'approve' && step === 'DISTRICT') {
      const mine = await tx.approval.findFirst({ where: { ...ACTIVE_DISTRICT_APPROVAL(batchId, batch.revision), officerId: user.id } });
      if (mine) {
        throw Errors.conflict('ALREADY_APPROVED', 'You have already approved this batch. The second approval must come from a different officer.');
      }
    }

    try {
      await tx.approval.create({
        data: {
          batchId,
          revision: batch.revision,
          step,
          officerId: user.id,
          decision: DECISION_ENUM[input.action],
          reason: input.reason ?? null,
        },
      });
    } catch (err) {
      // Backstop: the partial unique index on live decisions (batch, revision, step, officer).
      if (isUniqueViolation(err)) {
        throw Errors.conflict('ALREADY_DECIDED', 'You already have a decision recorded on this revision. Withdraw it first.');
      }
      throw err;
    }

    const districtApprovals =
      input.action === 'approve' && step === 'DISTRICT'
        ? await tx.approval.count({ where: ACTIVE_DISTRICT_APPROVAL(batchId, batch.revision) })
        : undefined;

    const to = transition(batch.status, input.action, {
      districtApprovals,
      candidateCount: batch.candidateCount,
      qualityThreshold: cfg.QUALITY_THRESHOLD,
    });

    const event =
      input.action === 'approve' ? (to === 'APPROVED' ? 'BatchFinalApproved' : 'BatchApproved') : input.action === 'reject' ? 'BatchRejected' : 'BatchSentBack';
    const auditAction = input.action === 'approve' ? (to === 'APPROVED' ? 'BATCH_FINAL_APPROVED' : 'BATCH_APPROVED') : input.action === 'reject' ? 'BATCH_REJECTED' : 'BATCH_SENT_BACK';

    return applyTransition(tx, batch, {
      to,
      actor: actorOf(user),
      auditAction,
      event,
      reason: input.reason ?? null,
      data: input.action === 'send_back' ? { sendBackReason: input.reason ?? null } : undefined,
      auditMetadata: { step, districtApprovals },
      eventExtra: { step, districtApprovals, required: step === 'DISTRICT' ? REQUIRED_DISTRICT_APPROVALS : 1 },
    });
  });
}

/** An officer fixing their own mistake, only while the batch is still at the district step. */
export async function withdrawApproval(user: AuthUser, batchId: string): Promise<Batch> {
  return prisma.$transaction(async (tx) => {
    const batch = await loadBatch(tx, batchId);
    assertAllowed(can(user, 'approval.withdraw', batch));
    const mine = await tx.approval.findFirst({ where: { ...ACTIVE_DISTRICT_APPROVAL(batchId, batch.revision), officerId: user.id } });
    if (!mine) throw Errors.notFound('You have no active approval on this batch to withdraw');
    await tx.approval.update({ where: { id: mine.id }, data: { withdrawnAt: new Date() } });
    return applyTransition(tx, batch, {
      to: batch.status,
      actor: actorOf(user),
      auditAction: 'APPROVAL_WITHDRAWN',
      event: 'BatchApprovalWithdrawn',
      auditMetadata: { approvalId: mine.id },
      eventExtra: { step: 'DISTRICT' },
    });
  });
}

// ---------------------------------------------------------------- queries

const summarySelect = {
  id: true,
  courseName: true,
  status: true,
  revision: true,
  version: true,
  candidateCount: true,
  sendBackReason: true,
  submittedAt: true,
  currentStepEnteredAt: true,
  slaBreachedAt: true,
  createdAt: true,
  updatedAt: true,
  centreId: true,
  districtId: true,
  centre: { select: { id: true, name: true } },
  district: { select: { id: true, name: true } },
} satisfies Prisma.BatchSelect;

/** Which batches this user may see at all. Shared by lists, queues and stats. */
export function scopeFilter(user: AuthUser): Prisma.BatchWhereInput {
  switch (user.role) {
    case 'CENTRE':
      return { centreId: user.centreId ?? '00000000-0000-0000-0000-000000000000' };
    case 'DISTRICT_OFFICER':
      return { districtId: user.districtId ?? '00000000-0000-0000-0000-000000000000', status: { not: 'DRAFT' } };
    case 'QUALITY':
    case 'STATE':
      return { status: { not: 'DRAFT' } };
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The batches this user may see. `q` searches course, centre and exact batch id
 * (used by the command palette); `status` narrows to one status. Scope always applies.
 */
export async function listBatches(user: AuthUser, opts: { q?: string; status?: BatchStatus } = {}) {
  const and: Prisma.BatchWhereInput[] = [scopeFilter(user)];
  if (opts.status) and.push({ status: opts.status });
  const q = opts.q?.trim();
  if (q) {
    and.push({
      OR: [
        { courseName: { contains: q, mode: 'insensitive' } },
        { centre: { name: { contains: q, mode: 'insensitive' } } },
        ...(UUID_RE.test(q) ? [{ id: q }] : []),
      ],
    });
  }
  return prisma.batch.findMany({ where: { AND: and }, select: summarySelect, orderBy: { updatedAt: 'desc' }, take: q ? 20 : 200 });
}

const NOTIFY_ACTIONS = [
  'BATCH_SUBMITTED',
  'BATCH_RESUBMITTED',
  'BATCH_APPROVED',
  'BATCH_FINAL_APPROVED',
  'BATCH_SENT_BACK',
  'BATCH_REJECTED',
  'APPROVAL_WITHDRAWN',
  'SLA_BREACHED',
  'ISSUANCE_COMPLETED',
  'DELIVERIES_RETRIED',
  'CERTIFICATE_REVOKED',
];

/**
 * Recent events on batches this user can see, excluding the user's own actions.
 * Read/unread is kept in the browser (docs/DECISIONS.md), so this is a plain feed.
 */
export async function getNotifications(user: AuthUser, limit = 30) {
  const visible = await prisma.batch.findMany({ where: scopeFilter(user), select: { id: true, courseName: true }, orderBy: { updatedAt: 'desc' }, take: 500 });
  if (visible.length === 0) return [];
  const course = new Map(visible.map((b) => [b.id, b.courseName]));
  const rows = await prisma.auditLog.findMany({
    where: {
      batchId: { in: [...course.keys()] },
      action: { in: NOTIFY_ACTIONS },
      // System events have no actor; NOT(actorId = me) alone would drop them (NULL semantics).
      OR: [{ actorId: null }, { actorId: { not: user.id } }],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    action: r.action,
    batchId: r.batchId!,
    courseName: course.get(r.batchId!) ?? 'A batch',
    actorName: r.actorId ? (actors.get(r.actorId) ?? null) : null,
    actorRole: r.actorRole,
    fromState: r.fromState,
    toState: r.toState,
    reason: r.reason,
    certificateNumber: typeof (r.metadata as Record<string, unknown>)?.certificateNumber === 'string' ? ((r.metadata as Record<string, unknown>).certificateNumber as string) : null,
  }));
}

export async function getBatchDetail(user: AuthUser, batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      ...summarySelect,
      candidates: {
        orderBy: { enrolmentId: 'asc' },
        select: {
          id: true,
          fullName: true,
          phone: true,
          enrolmentId: true,
          dob: true,
          score: true,
          passedOn: true,
          certificate: {
            select: {
              certificateNumber: true,
              status: true,
              issuedAt: true,
              revokedAt: true,
              revokeReason: true,
              deliveries: { select: { status: true, attempts: true, lastError: true, generation: true, updatedAt: true } },
            },
          },
        },
      },
      approvals: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          revision: true,
          step: true,
          decision: true,
          reason: true,
          superseded: true,
          withdrawnAt: true,
          createdAt: true,
          officerId: true,
          officer: { select: { name: true, role: true } },
        },
      },
    },
  });
  if (!batch) throw Errors.notFound('Batch not found');
  assertAllowed(can(user, 'batch.view', batch));

  const cfg = getConfig();
  const live = batch.approvals.filter((a) => a.revision === batch.revision && !a.superseded && !a.withdrawnAt);
  const districtApprovers = live.filter((a) => a.step === 'DISTRICT' && a.decision === 'APPROVE');
  const myActiveApproval = districtApprovers.some((a) => a.officerId === user.id);
  const allowed = (action: PolicyAction) => can(user, action, batch).allowed;

  const deliveries = batch.candidates.flatMap((c) => c.certificate?.deliveries ?? []);
  const deliverySummary = {
    certificates: batch.candidates.filter((c) => c.certificate).length,
    pending: deliveries.filter((d) => d.status === 'PENDING' || d.status === 'FAILED').length,
    sent: deliveries.filter((d) => d.status === 'SENT').length,
    delivered: deliveries.filter((d) => d.status === 'DELIVERED').length,
    dead: deliveries.filter((d) => d.status === 'DEAD').length,
    retrying: deliveries.filter((d) => (d.status === 'PENDING' || d.status === 'FAILED') && d.attempts > 0).length,
  };

  return {
    batch,
    districtApprovals: {
      required: REQUIRED_DISTRICT_APPROVALS,
      count: districtApprovers.length,
      officers: districtApprovers.map((a) => a.officer.name),
    },
    needsQualityReview: needsQualityReview(batch.candidateCount, cfg.QUALITY_THRESHOLD),
    qualityThreshold: cfg.QUALITY_THRESHOLD,
    myActiveApproval,
    deliverySummary,
    allowed: {
      edit: allowed('batch.edit'),
      submit: allowed('batch.submit'),
      resubmit: allowed('batch.resubmit'),
      approve: allowed('batch.approve') && !myActiveApproval,
      reject: allowed('batch.reject'),
      sendBack: allowed('batch.send_back'),
      withdraw: allowed('approval.withdraw') && myActiveApproval,
      revoke: user.role === 'STATE',
      retryDeliveries: user.role === 'STATE' && batch.status === 'PARTIALLY_ISSUED',
    },
  };
}

/** "Waiting for me": what this user needs to act on, oldest first. */
export async function getWorkQueue(user: AuthUser) {
  const where: Prisma.BatchWhereInput =
    user.role === 'CENTRE'
      ? { ...scopeFilter(user), status: { in: ['DRAFT', 'SENT_BACK'] } }
      : user.role === 'DISTRICT_OFFICER'
        ? { ...scopeFilter(user), status: 'PENDING_DISTRICT' }
        : user.role === 'QUALITY'
          ? { status: 'PENDING_QUALITY' }
          : { status: 'PENDING_STATE' };

  const batches = await prisma.batch.findMany({
    where,
    select: {
      ...summarySelect,
      approvals: {
        where: { step: 'DISTRICT', decision: 'APPROVE', superseded: false, withdrawnAt: null },
        select: { officerId: true, revision: true, officer: { select: { name: true } } },
      },
    },
    orderBy: [{ currentStepEnteredAt: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });
  const now = Date.now();
  const sla = slaMs();
  return batches.map(({ approvals, ...b }) => {
    const current = approvals.filter((a) => a.revision === b.revision);
    const since = b.currentStepEnteredAt ?? b.createdAt;
    return {
      ...b,
      waitingSince: since,
      ageSeconds: Math.round((now - since.getTime()) / 1000),
      slaDueAt: b.currentStepEnteredAt ? new Date(b.currentStepEnteredAt.getTime() + sla) : null,
      districtApprovals: current.length,
      approverNames: current.map((a) => a.officer.name),
      iApproved: current.some((a) => a.officerId === user.id),
    };
  });
}

/** Full, ordered story of one batch: every decision, issuance and delivery attempt. */
export async function getTimeline(user: AuthUser, batchId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) throw Errors.notFound('Batch not found');
  assertAllowed(can(user, 'batch.view', batch));

  const [audit, attempts] = await Promise.all([
    prisma.auditLog.findMany({ where: { batchId }, orderBy: { createdAt: 'asc' }, take: 5000 }),
    prisma.deliveryAttempt.findMany({
      where: { delivery: { certificate: { batchId } } },
      orderBy: { createdAt: 'asc' },
      take: 5000,
      include: { delivery: { select: { certificate: { select: { certificateNumber: true } } } } },
    }),
  ]);

  const actorIds = [...new Set(audit.map((a) => a.actorId).filter((id): id is string => !!id))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));

  const items = [
    ...audit.map((a) => ({
      at: a.createdAt,
      kind: 'audit' as const,
      action: a.action,
      actorRole: a.actorRole,
      actorName: a.actorId ? (nameOf.get(a.actorId) ?? null) : null,
      entityType: a.entityType,
      entityId: a.entityId,
      fromState: a.fromState,
      toState: a.toState,
      reason: a.reason,
      metadata: a.metadata,
      correlationId: a.correlationId,
    })),
    ...attempts.map((t) => ({
      at: t.createdAt,
      kind: 'delivery_attempt' as const,
      action: `DELIVERY_ATTEMPT_${t.outcome}`,
      actorRole: 'SYSTEM',
      actorName: null,
      entityType: 'DELIVERY',
      entityId: t.deliveryId,
      fromState: null,
      toState: null,
      reason: t.error,
      metadata: { attemptNo: t.attemptNo, httpStatus: t.httpStatus, certificateNumber: t.delivery.certificate.certificateNumber },
      correlationId: null,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return { batchId, items };
}
