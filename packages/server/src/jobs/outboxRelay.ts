// Outbox relay: moves committed events from Postgres to BullMQ + Socket.IO.
// Safe on many worker instances at once thanks to FOR UPDATE SKIP LOCKED: each row
// is claimed by exactly one relay. If we crash after enqueueing but before marking
// the row published, the next run re-enqueues it with the same jobId (the event id),
// which BullMQ ignores: at-least-once delivery, effectively-once processing.
import type { Prisma } from '@prisma/client';
import type { EventType } from '@certiflow/shared';
import { prisma } from '../db';
import { logger } from '../logger';
import { QUEUE, getQueue } from '../queues';
import { publishRealtime } from '../realtime';

interface OutboxRow {
  id: string;
  type: string;
  payload: Prisma.JsonValue;
  correlationId: string;
}

export async function relayOutboxOnce(batchSize = 100): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT "id", "type", "payload", "correlationId"
        FROM "OutboxEvent"
        WHERE "publishedAt" IS NULL
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return 0;

      await getQueue(QUEUE.events).addBulk(
        rows.map((r) => ({
          name: r.type,
          data: { eventId: r.id, type: r.type, payload: r.payload, correlationId: r.correlationId },
          opts: { jobId: r.id, attempts: 10, backoff: { type: 'exponential', delay: 1000 } },
        })),
      );
      for (const r of rows) publishRealtime(r.type as EventType, (r.payload ?? {}) as Record<string, unknown>);

      await tx.outboxEvent.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { publishedAt: new Date() } });
      return rows.length;
    },
    { timeout: 20_000 },
  );
}

/** Polls continuously; drains quickly when there is a backlog, sleeps when idle. */
export function startOutboxRelay(intervalMs: number): () => Promise<void> {
  let running = true;
  let current: Promise<void> = Promise.resolve();
  let failures = 0;

  const loop = async () => {
    while (running) {
      try {
        const n = await relayOutboxOnce();
        failures = 0;
        if (n === 0) await sleep(intervalMs);
      } catch (err) {
        failures++;
        logger.error({ err: (err as Error).message }, 'outbox relay failed');
        await sleep(Math.min(30_000, intervalMs * 2 ** failures));
      }
    }
  };
  current = loop();

  return async () => {
    running = false;
    await current;
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
