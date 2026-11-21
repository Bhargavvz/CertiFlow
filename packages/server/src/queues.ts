// BullMQ queues. Job ids are deterministic so that enqueueing the same work twice
// (relay retry, worker restart, duplicate event) is a no-op instead of duplicate work.
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { getConfig } from './config';
import { currentCorrelationId } from './context';
import { createRedis } from './redis';

export const QUEUE = {
  events: 'outbox.events',
  certificateGenerate: 'certificate.generate',
  whatsappSend: 'whatsapp.send',
  whatsappDlq: 'whatsapp.dlq',
  sla: 'sla.check',
} as const;
export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];
export const ALL_QUEUES: QueueName[] = Object.values(QUEUE);

let connection: Redis | undefined;
const queues = new Map<QueueName, Queue>();

export function queueConnection(): Redis {
  if (!connection) connection = createRedis('bullmq-producer');
  return connection;
}

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: queueConnection(),
      defaultJobOptions: {
        // Keep finished jobs for a day: lets dedup-by-jobId work and Bull Board show history.
        removeOnComplete: { age: 24 * 3600, count: 20_000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    queues.set(name, q);
  }
  return q;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => undefined)));
  queues.clear();
  if (connection) {
    await connection.quit().catch(() => undefined);
    connection = undefined;
  }
}

/** BullMQ custom job ids must not contain ':' so we join with '__'. */
export function jobId(...parts: (string | number)[]): string {
  return parts.join('__');
}

export async function enqueueCertificateJobs(batchId: string, candidateIds: string[]): Promise<void> {
  const correlationId = currentCorrelationId();
  await getQueue(QUEUE.certificateGenerate).addBulk(
    candidateIds.map((candidateId) => ({
      name: 'generate',
      data: { batchId, candidateId, correlationId },
      opts: {
        jobId: jobId('gen', candidateId),
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
      },
    })),
  );
}

export async function enqueueWhatsappSend(deliveryId: string, generation: number): Promise<void> {
  const cfg = getConfig();
  await getQueue(QUEUE.whatsappSend).add(
    'send',
    { deliveryId, correlationId: currentCorrelationId() },
    {
      jobId: jobId('send', deliveryId, `g${generation}`),
      attempts: cfg.WHATSAPP_MAX_ATTEMPTS,
      // 'jittered' is our custom strategy (see jobs/backoff.ts): exponential with jitter,
      // honouring the provider's Retry-After on 429.
      backoff: { type: 'jittered' },
    },
  );
}

export interface SlaCheckData {
  batchId: string;
  status: string;
  stepEnteredAt: string;
  slaMs: number;
}

export async function scheduleSlaCheck(data: Omit<SlaCheckData, 'slaMs'>, slaMilliseconds: number): Promise<void> {
  const enteredAt = new Date(data.stepEnteredAt).getTime();
  const delay = Math.max(0, enteredAt + slaMilliseconds - Date.now());
  await getQueue(QUEUE.sla).add(
    'check',
    { ...data, slaMs: slaMilliseconds, correlationId: currentCorrelationId() },
    { jobId: jobId('sla', data.batchId, data.status, enteredAt), delay, attempts: 3, backoff: { type: 'fixed', delay: 5000 } },
  );
}
