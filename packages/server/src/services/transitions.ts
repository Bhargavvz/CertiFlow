// The one place that persists a batch status change. It always does three things
// in the caller's transaction: optimistic-locked UPDATE, audit row, outbox event.
// That is what makes "every change is traceable" and "advances exactly once" hold.
import type { Batch, Prisma } from '@prisma/client';
import type { BatchStatus, EventType } from '@certiflow/shared';
import { writeAudit, type Actor } from '../audit';
import type { Tx } from '../db';
import { Errors } from '../errors';
import { addOutboxEvent } from '../outbox';

export interface TransitionArgs {
  to: BatchStatus;
  actor: Actor;
  auditAction: string;
  event: EventType;
  reason?: string | null;
  /** Extra columns to set in the same UPDATE (revision, candidateCount, ...). */
  data?: Prisma.BatchUpdateManyMutationInput;
  auditMetadata?: Record<string, unknown>;
  eventExtra?: Record<string, unknown>;
}

export async function applyTransition(tx: Tx, batch: Batch, args: TransitionArgs): Promise<Batch> {
  const stepChanged = args.to !== batch.status;
  const now = new Date();

  // Optimistic concurrency: succeeds only if nobody changed the batch since we read it.
  // Two concurrent approvals both try this; Postgres serialises them on the row lock and
  // the second sees version already bumped -> 0 rows -> 409, and its whole tx rolls back.
  const updated = await tx.batch.updateMany({
    where: { id: batch.id, version: batch.version },
    data: {
      ...args.data,
      status: args.to,
      version: { increment: 1 },
      ...(stepChanged ? { currentStepEnteredAt: now, slaBreachedAt: null } : {}),
    },
  });
  if (updated.count !== 1) {
    throw Errors.conflict('VERSION_CONFLICT', 'This batch was changed by someone else just now. Reload and try again.');
  }

  const after = await tx.batch.findUniqueOrThrow({ where: { id: batch.id } });

  await writeAudit(tx, {
    actor: args.actor,
    action: args.auditAction,
    entityType: 'BATCH',
    entityId: batch.id,
    fromState: batch.status,
    toState: args.to,
    reason: args.reason ?? null,
    metadata: { revision: after.revision, version: after.version, ...args.auditMetadata },
  });

  await addOutboxEvent(tx, args.event, {
    batchId: batch.id,
    centreId: batch.centreId,
    districtId: batch.districtId,
    courseName: batch.courseName,
    fromState: batch.status,
    toState: args.to,
    stepChanged,
    stepEnteredAt: after.currentStepEnteredAt?.toISOString() ?? null,
    revision: after.revision,
    version: after.version,
    actorId: args.actor.id,
    actorRole: args.actor.role,
    reason: args.reason ?? null,
    ...args.eventExtra,
  });

  return after;
}
