import type { Prisma } from '@prisma/client';
import type { EventType } from '@certiflow/shared';
import { currentCorrelationId } from './context';
import type { Tx } from './db';

/**
 * Transactional outbox: record the event in the same transaction as the state
 * change. If the transaction rolls back, the event never existed; if it commits,
 * the relay is guaranteed to publish it eventually (even after a crash).
 */
export async function addOutboxEvent(tx: Tx, type: EventType, payload: Record<string, unknown>): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      correlationId: currentCorrelationId(),
    },
  });
}
