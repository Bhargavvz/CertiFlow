// Starts BullMQ workers for every queue plus the outbox relay. Used by
// apps/worker in production and by integration tests in-process.
import { Worker, type Job } from 'bullmq';
import type { EventType } from '@certiflow/shared';
import { getConfig } from '../config';
import { withCorrelation } from '../context';
import { logger } from '../logger';
import { QUEUE, getQueue, type QueueName, type SlaCheckData } from '../queues';
import { createRedis } from '../redis';
import { processWhatsappSend } from '../services/deliveryService';
import { generateCertificate, type GenerateJobData } from '../services/issuanceService';
import { handleSlaCheckJob, sweepSla } from '../services/slaService';
import { deliveryBackoff } from './backoff';
import { handleEvent } from './eventHandlers';
import { startOutboxRelay } from './outboxRelay';

export interface StartWorkersOptions {
  /** Limit to some queues (tests). Default: all processing queues. */
  queues?: QueueName[];
  relay?: boolean;
  sweep?: boolean;
}

export interface WorkerHandles {
  workers: Worker[];
  close(): Promise<void>;
}

type WithCorrelation = { correlationId?: string };
type EventJob = { type: EventType; payload: Record<string, unknown> } & WithCorrelation;
type GenerateJob = GenerateJobData & WithCorrelation;
type SendJob = { deliveryId: string } & WithCorrelation;
type SlaJob = SlaCheckData & WithCorrelation;

/** Run each job inside its correlation id, so its logs/audit rows link back to the request. */
function traced<T extends WithCorrelation, R>(fn: (job: Job<T>) => Promise<R>) {
  return (job: Job<T>) => withCorrelation(job.data.correlationId ?? `job-${job.queueName}-${job.id}`, () => fn(job));
}

export async function startWorkers(opts: StartWorkersOptions = {}): Promise<WorkerHandles> {
  const cfg = getConfig();
  const connection = createRedis('bullmq-worker');
  const want = (q: QueueName) => !opts.queues || opts.queues.includes(q);
  const workers: Worker[] = [];

  if (want(QUEUE.events)) {
    workers.push(
      new Worker<EventJob>(
        QUEUE.events,
        traced(async (job: Job<EventJob>) => handleEvent(job.data.type, job.data.payload)),
        { connection, concurrency: 20 },
      ),
    );
  }

  if (want(QUEUE.certificateGenerate)) {
    workers.push(
      new Worker<GenerateJob>(QUEUE.certificateGenerate, traced(async (job: Job<GenerateJob>) => generateCertificate(job.data)), {
        connection,
        concurrency: cfg.CERT_CONCURRENCY,
      }),
    );
  }

  if (want(QUEUE.whatsappSend)) {
    workers.push(
      new Worker<SendJob>(
        QUEUE.whatsappSend,
        traced(async (job: Job<SendJob>) => {
          // Lets the processor dead-letter the delivery before BullMQ gives up on the job.
          const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
          return processWhatsappSend(job.data.deliveryId, isFinalAttempt);
        }),
        { connection, concurrency: cfg.SEND_CONCURRENCY, settings: { backoffStrategy: deliveryBackoff } },
      ),
    );
  }

  if (want(QUEUE.sla)) {
    workers.push(
      new Worker<SlaJob>(
        QUEUE.sla,
        traced(async (job: Job<SlaJob>) => (job.name === 'sweep' ? sweepSla() : handleSlaCheckJob(job.data))),
        { connection, concurrency: 5 },
      ),
    );
  }

  for (const w of workers) {
    w.on('failed', (job, err) =>
      logger.warn({ queue: w.name, jobId: job?.id, attemptsMade: job?.attemptsMade, err: err.message }, 'job attempt failed'),
    );
    w.on('error', (err) => logger.error({ queue: w.name, err: err.message }, 'worker error'));
  }

  const stopRelay = opts.relay === false ? null : startOutboxRelay(cfg.OUTBOX_POLL_MS);

  if (opts.sweep !== false) {
    // A job scheduler is a single repeatable job no matter how many workers register it.
    await getQueue(QUEUE.sla).upsertJobScheduler('sla-sweep', { every: cfg.SLA_SWEEP_EVERY_MS }, { name: 'sweep', data: {} });
  }

  logger.info({ queues: workers.map((w) => w.name), relay: !!stopRelay }, 'workers started');

  return {
    workers,
    async close() {
      if (stopRelay) await stopRelay();
      await Promise.all(workers.map((w) => w.close()));
      await connection.quit().catch(() => undefined);
    },
  };
}
