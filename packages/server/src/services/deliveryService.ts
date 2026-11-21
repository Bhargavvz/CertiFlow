// WhatsApp delivery (Moment 3): at most one successful message per idempotency key,
// at least one attempt until DELIVERED or DEAD (dead-letter queue).
import { can, transition, type AuthUser } from '@certiflow/shared';
import { PROVIDER_ACTOR, SYSTEM_ACTOR, actorOf, writeAudit } from '../audit';
import { prisma } from '../db';
import { Errors, assertAllowed } from '../errors';
import { logger } from '../logger';
import { addOutboxEvent } from '../outbox';
import { QUEUE, getQueue, jobId } from '../queues';
import { downloadTokenFor, downloadUrl, verifyUrl } from '../tokens';
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

  const link = downloadUrl(downloadTokenFor(certificate.id));
  const firstName = certificate.candidate.fullName.split(/\s+/)[0];
  const message = {
    to: certificate.candidate.phone,
    link,
    text:
      `Congratulations ${firstName}! Your Pragati Skills Mission certificate ${certificate.certificateNumber} ` +
      `for "${certificate.batch.courseName}" is ready. Download: ${link} . Anyone can verify it at ${verifyUrl(certificate.certificateNumber)}`,
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
