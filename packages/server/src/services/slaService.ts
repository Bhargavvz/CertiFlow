// Moment 5: SLA escalation. Two independent triggers, both idempotent:
//  - a delayed BullMQ job scheduled when a batch enters a review step (precise), and
//  - a periodic sweep (safety net if Redis lost the delayed job).
// A breach is recorded once per step entry and pushed to the State office in realtime.
import type { Batch } from '@prisma/client';
import { REVIEW_STATES } from '@certiflow/shared';
import { SYSTEM_ACTOR, writeAudit } from '../audit';
import { getConfig, slaMs } from '../config';
import { prisma } from '../db';
import { addOutboxEvent } from '../outbox';
import type { SlaCheckData } from '../queues';

async function markBreached(batch: Batch, slaMilliseconds: number): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Conditional update: only if the batch is still in the same step entry and not
    // already flagged. Does not bump `version`, so reviewers' If-Match stays valid.
    const updated = await tx.batch.updateMany({
      where: {
        id: batch.id,
        status: batch.status,
        currentStepEnteredAt: batch.currentStepEnteredAt,
        slaBreachedAt: null,
      },
      data: { slaBreachedAt: new Date() },
    });
    if (updated.count !== 1) return false;
    await writeAudit(tx, {
      actor: SYSTEM_ACTOR,
      action: 'SLA_BREACHED',
      entityType: 'BATCH',
      entityId: batch.id,
      fromState: batch.status,
      toState: batch.status,
      metadata: { waitingSince: batch.currentStepEnteredAt?.toISOString(), slaMs: slaMilliseconds },
    });
    await addOutboxEvent(tx, 'SlaBreached', {
      batchId: batch.id,
      centreId: batch.centreId,
      districtId: batch.districtId,
      courseName: batch.courseName,
      status: batch.status,
      waitingSince: batch.currentStepEnteredAt?.toISOString() ?? null,
      slaMs: slaMilliseconds,
    });
    return true;
  });
}

/** Delayed job: fires SLA after the batch entered the step. */
export async function handleSlaCheckJob(data: SlaCheckData): Promise<boolean> {
  const batch = await prisma.batch.findUnique({ where: { id: data.batchId } });
  if (!batch || batch.slaBreachedAt || !batch.currentStepEnteredAt) return false;
  // The batch moved on (or re-entered the step later): this job is stale.
  if (batch.status !== data.status || batch.currentStepEnteredAt?.toISOString() !== data.stepEnteredAt) return false;
  if (Date.now() - batch.currentStepEnteredAt.getTime() < data.slaMs) return false;
  return markBreached(batch, data.slaMs);
}

/** Periodic safety net. Returns how many batches were newly flagged. */
export async function sweepSla(now = new Date(), slaMilliseconds = slaMs()): Promise<number> {
  const cutoff = new Date(now.getTime() - slaMilliseconds);
  const stale = await prisma.batch.findMany({
    where: { status: { in: [...REVIEW_STATES] }, slaBreachedAt: null, currentStepEnteredAt: { lte: cutoff } },
    take: 500,
  });
  let flagged = 0;
  for (const batch of stale) if (await markBreached(batch, slaMilliseconds)) flagged++;
  return flagged;
}

/** State dashboard: breached first, then everything waiting, oldest first. */
export async function getStuckBatches() {
  const sla = slaMs();
  const waiting = await prisma.batch.findMany({
    where: { status: { in: [...REVIEW_STATES] } },
    orderBy: { currentStepEnteredAt: 'asc' },
    take: 200,
    select: {
      id: true,
      courseName: true,
      status: true,
      candidateCount: true,
      revision: true,
      currentStepEnteredAt: true,
      slaBreachedAt: true,
      centre: { select: { name: true } },
      district: { select: { name: true } },
    },
  });
  const now = Date.now();
  const items = waiting.map((b) => {
    const since = b.currentStepEnteredAt ?? new Date(now);
    return {
      ...b,
      ageSeconds: Math.round((now - since.getTime()) / 1000),
      overdueSeconds: Math.max(0, Math.round((now - since.getTime() - sla) / 1000)),
      breached: b.slaBreachedAt !== null,
    };
  });
  return {
    slaSeconds: Math.round(sla / 1000),
    slaSource: getConfig().SLA_OVERRIDE_SECONDS ? 'override' : 'hours',
    breached: items.filter((i) => i.breached),
    waiting: items,
  };
}
