// WhatsApp delivery (Moment 3): at most one successful message per idempotency key,
// at least one attempt until DELIVERED or DEAD (dead-letter queue).
import { can, transition, type AuthUser } from '@certiflow/shared';
import { PROVIDER_ACTOR, SYSTEM_ACTOR, actorOf, writeAudit } from '../audit';
import { prisma } from '../db';
import { Errors, assertAllowed } from '../errors';
import { logger } from '../logger';
import { addOutboxEvent } from '../outbox';
import { QUEUE, getQueue, jobId } from '../queues';
import { candidatePageUrl, downloadTokenFor, verifyUrl } from '../tokens';
import { ProviderError, sendWhatsapp } from './whatsappClient';
import { applyTransition } from './transitions';

/** Provider-reported failures we resend with a fresh key, before giving up. */
export const MAX_GENERATIONS = 3;

export function idempotencyKeyFor(deliveryId: string, generation: number): string {
  return `dlv-${deliveryId}-g${generation}`;
}

/**
 * Process one whatsapp.send job attempt. Throws to let BullMQ retry with backoff.
 * `isFinalAttempt` lets us mark the delivery DEAD and dead-letter it before the
 * last throw, so nothing silently disappears.
 */
export async function processWhatsappSend(deliveryId: string, isFinalAttempt: boolean): Promise<'sent' | 'skipped'> {
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { certificate: { include: { candidate: true, batch: true } } },
  });
  if (!delivery) return 'skipped';
  // Already done (or given up): a duplicate/retried job must not send again.
  if (delivery.status === 'SENT' || delivery.status === 'DELIVERED' || delivery.status === 'DEAD') return 'skipped';
  if (delivery.certificate.status === 'REVOKED') return 'skipped';

  const { certificate } = delivery;
  const key = delivery.idempotencyKey; // read fresh every attempt
  const attemptNo = delivery.attempts + 1;
  await prisma.delivery.update({ where: { id: deliveryId }, data: { attempts: { increment: 1 } } });

  // The link opens a small mobile page (course, date, Download, Share), not a raw PDF.
  const link = candidatePageUrl(downloadTokenFor(certificate.id));
  const firstName = certificate.candidate.fullName.split(/\s+/)[0];
  const message = {
    to: certificate.candidate.phone,
    link,
    text:
      `Congratulations ${firstName}! Your Pragati Skills Mission certificate ${certificate.certificateNumber} ` +
      `for "${certificate.batch.courseName}" is ready. Open: ${link} . Anyone can verify it at ${verifyUrl(certificate.certificateNumber)}`,
  };

  try {
    const result = await sendWhatsapp(message, key);
    await prisma.$transaction(async (tx) => {
      await tx.deliveryAttempt.create({
        data: { deliveryId, attemptNo, idempotencyKey: key, outcome: result.replayed ? 'ACCEPTED_REPLAY' : 'ACCEPTED', httpStatus: result.httpStatus },
      });
      // Guarded on the key too: if a webhook already moved us on (or regenerated the key), do nothing.
      const updated = await tx.delivery.updateMany({
        where: { id: deliveryId, idempotencyKey: key, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'SENT', providerMessageId: result.messageId, lastError: null },
      });
      if (updated.count === 1) {
        await writeAudit(tx, {
          actor: SYSTEM_ACTOR,
          action: 'DELIVERY_SENT',
          entityType: 'DELIVERY',
          entityId: deliveryId,
          batchId: certificate.batchId,
          fromState: delivery.status,
          toState: 'SENT',
          metadata: { attemptNo, providerMessageId: result.messageId, replayed: result.replayed },
        });
      }
    });
    return 'sent';
  } catch (err) {
    if (!(err instanceof ProviderError)) throw err;
    const giveUp = isFinalAttempt || !err.retryable;
    await prisma.$transaction(async (tx) => {
      await tx.deliveryAttempt.create({
        data: { deliveryId, attemptNo, idempotencyKey: key, outcome: err.kind.toUpperCase(), httpStatus: err.httpStatus ?? null, error: err.message },
      });
      if (!giveUp) {
        await tx.delivery.updateMany({ where: { id: deliveryId, idempotencyKey: key, status: { in: ['PENDING', 'FAILED'] } }, data: { lastError: err.message } });
        return;
      }
      const dead = await tx.delivery.updateMany({
        where: { id: deliveryId, idempotencyKey: key, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'DEAD', lastError: err.message },
      });
      if (dead.count === 1) {
        await writeAudit(tx, {
          actor: SYSTEM_ACTOR,
          action: 'DELIVERY_DEAD',
          entityType: 'DELIVERY',
          entityId: deliveryId,
          batchId: certificate.batchId,
          fromState: delivery.status,
          toState: 'DEAD',
          reason: err.message,
          metadata: { attempts: attemptNo },
        });
        await addOutboxEvent(tx, 'DeliveryFailed', {
          batchId: certificate.batchId,
          centreId: certificate.batch.centreId,
          districtId: certificate.batch.districtId,
          deliveryId,
          certificateNumber: certificate.certificateNumber,
          final: true,
          error: err.message,
        });
      }
    });
    if (giveUp) {
      await getQueue(QUEUE.whatsappDlq).add(
        'dead',
        { deliveryId, certificateNumber: certificate.certificateNumber, error: err.message, attempts: attemptNo },
        { jobId: jobId('dead', deliveryId, key) },
      );
      logger.error({ deliveryId, attempts: attemptNo }, 'delivery moved to dead-letter queue');
    }
    throw err;
  }
}

export interface ProviderWebhook {
  messageId: string;
  idempotencyKey: string;
  status: 'delivered' | 'failed';
  reason?: string;
}

/** Signed delivery receipt from the provider (signature checked by the API route). */
export async function handleProviderWebhook(evt: ProviderWebhook): Promise<{ outcome: string }> {
  // Look up by idempotency key: it is known even before we stored providerMessageId.
  const delivery = await prisma.delivery.findUnique({
    where: { idempotencyKey: evt.idempotencyKey },
    include: { certificate: { include: { batch: true } } },
  });
  if (!delivery) return { outcome: 'ignored_unknown_or_old_key' };
  const { certificate } = delivery;
  const routing = { batchId: certificate.batchId, centreId: certificate.batch.centreId, districtId: certificate.batch.districtId };

  return prisma.$transaction(async (tx) => {
    if (evt.status === 'delivered') {
      // DEAD is included: the provider may have delivered a message whose response we never saw.
      const updated = await tx.delivery.updateMany({
        where: { id: delivery.id, idempotencyKey: evt.idempotencyKey, status: { in: ['PENDING', 'SENT', 'FAILED', 'DEAD'] } },
        data: { status: 'DELIVERED', providerMessageId: evt.messageId, deliveredAt: new Date(), lastError: null },
      });
      if (updated.count === 0) return { outcome: 'duplicate' };
      await writeAudit(tx, {
        actor: PROVIDER_ACTOR,
        action: 'DELIVERY_DELIVERED',
        entityType: 'DELIVERY',
        entityId: delivery.id,
        batchId: certificate.batchId,
        fromState: delivery.status,
        toState: 'DELIVERED',
        metadata: { providerMessageId: evt.messageId },
      });
      await addOutboxEvent(tx, 'DeliverySucceeded', { ...routing, deliveryId: delivery.id, certificateNumber: certificate.certificateNumber });
      return { outcome: 'delivered' };
    }

    // status === 'failed': the provider definitely did not deliver. Resend with a NEW key.
    if (delivery.status !== 'SENT' && delivery.status !== 'PENDING') return { outcome: 'ignored' };
    const giveUp = delivery.generation >= MAX_GENERATIONS;
    const nextGeneration = delivery.generation + 1;
    const updated = await tx.delivery.updateMany({
      where: { id: delivery.id, idempotencyKey: evt.idempotencyKey },
      data: giveUp
        ? { status: 'DEAD', lastError: evt.reason ?? 'provider reported failure' }
        : {
            status: 'FAILED',
            generation: nextGeneration,
            idempotencyKey: idempotencyKeyFor(delivery.id, nextGeneration),
            attempts: 0,
            lastError: evt.reason ?? 'provider reported failure',
          },
    });
    if (updated.count === 0) return { outcome: 'duplicate' };
    await writeAudit(tx, {
      actor: PROVIDER_ACTOR,
      action: giveUp ? 'DELIVERY_DEAD' : 'DELIVERY_FAILED_RESENDING',
      entityType: 'DELIVERY',
      entityId: delivery.id,
      batchId: certificate.batchId,
      fromState: delivery.status,
      toState: giveUp ? 'DEAD' : 'FAILED',
      reason: evt.reason ?? null,
      metadata: { generation: delivery.generation },
    });
    await addOutboxEvent(tx, 'DeliveryFailed', {
      ...routing,
      deliveryId: delivery.id,
      certificateNumber: certificate.certificateNumber,
      final: giveUp,
      retry: !giveUp,
      generation: nextGeneration,
      error: evt.reason ?? null,
    });
    return { outcome: giveUp ? 'dead' : 'resending' };
  });
}

/** State office: give dead deliveries of a partially issued batch another go. */
export async function retryDeadDeliveries(user: AuthUser, batchId: string): Promise<{ retried: number }> {
  assertAllowed(can(user, 'delivery.retry'));
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw Errors.notFound('Batch not found');
    if (batch.status !== 'PARTIALLY_ISSUED') throw Errors.conflict('INVALID_STATE', 'Only a partially issued batch has dead deliveries to retry');

    const dead = await tx.delivery.findMany({ where: { status: 'DEAD', certificate: { batchId } } });
    for (const d of dead) {
      const generation = d.generation + 1;
      await tx.delivery.update({
        where: { id: d.id },
        data: { status: 'FAILED', generation, idempotencyKey: idempotencyKeyFor(d.id, generation), attempts: 0 },
      });
      await addOutboxEvent(tx, 'DeliveryFailed', {
        batchId,
        centreId: batch.centreId,
        districtId: batch.districtId,
        deliveryId: d.id,
        retry: true,
        manual: true,
        generation,
      });
    }
    await applyTransition(tx, batch, {
      to: transition(batch.status, 'retry_deliveries'),
      actor: actorOf(user),
      auditAction: 'DELIVERIES_RETRIED',
      event: 'BatchDeliveriesRetried',
      auditMetadata: { retried: dead.length },
      eventExtra: { retried: dead.length },
    });
    return { retried: dead.length };
  });
}

/** Phone shown to the State office as +91 98•••••123: enough to tell people apart. */
function maskPhone(phone: string): string {
  return phone.length > 7 ? `${phone.slice(0, 5)}${'•'.repeat(phone.length - 8)}${phone.slice(-3)}` : '•••';
}

/**
 * State deliveries view: per-batch progress for batches being (or recently) issued,
 * and every dead-lettered delivery with the reason it failed.
 */
export async function getDeliveriesOverview(user: AuthUser) {
  assertAllowed(can(user, 'delivery.retry'));
  const batches = await prisma.batch.findMany({
    where: { status: { in: ['APPROVED', 'ISSUING', 'PARTIALLY_ISSUED', 'ISSUED'] } },
    orderBy: { updatedAt: 'desc' },
    take: 25,
    select: { id: true, courseName: true, status: true, candidateCount: true, updatedAt: true, centre: { select: { name: true } } },
  });
  const perBatch = await Promise.all(
    batches.map(async (b) => {
      const rows = await prisma.delivery.groupBy({ by: ['status'], where: { certificate: { batchId: b.id } }, _count: { _all: true } });
      const counts = { PENDING: 0, SENT: 0, DELIVERED: 0, FAILED: 0, DEAD: 0 };
      for (const r of rows) counts[r.status] = r._count._all;
      const certificates = await prisma.certificate.count({ where: { batchId: b.id } });
      return { ...b, certificates, counts };
    }),
  );

  const dead = await prisma.delivery.findMany({
    where: { status: 'DEAD' },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      attempts: true,
      generation: true,
      lastError: true,
      updatedAt: true,
      certificate: {
        select: {
          certificateNumber: true,
          batchId: true,
          candidate: { select: { fullName: true, phone: true } },
          batch: { select: { courseName: true, status: true, centre: { select: { name: true } } } },
        },
      },
    },
  });

  return {
    batches: perBatch,
    dead: dead.map((d) => ({
      id: d.id,
      attempts: d.attempts,
      generation: d.generation,
      lastError: d.lastError,
      updatedAt: d.updatedAt,
      certificateNumber: d.certificate.certificateNumber,
      batchId: d.certificate.batchId,
      courseName: d.certificate.batch.courseName,
      batchStatus: d.certificate.batch.status,
      centreName: d.certificate.batch.centre.name,
      candidateName: d.certificate.candidate.fullName,
      phone: maskPhone(d.certificate.candidate.phone),
    })),
  };
}

/** State office: retry ONE dead delivery with a fresh idempotency key (audited). */
export async function retryDelivery(user: AuthUser, deliveryId: string): Promise<{ generation: number }> {
  assertAllowed(can(user, 'delivery.retry'));
  return prisma.$transaction(async (tx) => {
    const d = await tx.delivery.findUnique({ where: { id: deliveryId }, include: { certificate: { include: { batch: true } } } });
    if (!d) throw Errors.notFound('Delivery not found');
    if (d.status !== 'DEAD') throw Errors.conflict('INVALID_STATE', 'Only a failed (dead-lettered) delivery can be retried');
    const generation = d.generation + 1;
    const updated = await tx.delivery.updateMany({
      where: { id: d.id, status: 'DEAD', generation: d.generation },
      data: { status: 'FAILED', generation, idempotencyKey: idempotencyKeyFor(d.id, generation), attempts: 0 },
    });
    if (updated.count !== 1) throw Errors.conflict('VERSION_CONFLICT', 'This delivery was changed a moment ago. Refresh and try again.');
    const batch = d.certificate.batch;
    await writeAudit(tx, {
      actor: actorOf(user),
      action: 'DELIVERY_RETRIED',
      entityType: 'DELIVERY',
      entityId: d.id,
      batchId: batch.id,
      fromState: 'DEAD',
      toState: 'FAILED',
      metadata: { generation, certificateNumber: d.certificate.certificateNumber },
    });
    await addOutboxEvent(tx, 'DeliveryFailed', {
      batchId: batch.id,
      centreId: batch.centreId,
      districtId: batch.districtId,
      deliveryId: d.id,
      retry: true,
      manual: true,
      generation,
    });
    // A partially issued batch goes back to "issuing" while the retry runs.
    if (batch.status === 'PARTIALLY_ISSUED') {
      await applyTransition(tx, batch, {
        to: transition(batch.status, 'retry_deliveries'),
        actor: actorOf(user),
        auditAction: 'DELIVERIES_RETRIED',
        event: 'BatchDeliveriesRetried',
        auditMetadata: { retried: 1, deliveryId: d.id },
        eventExtra: { retried: 1 },
      });
    }
    return { generation };
  });
}
