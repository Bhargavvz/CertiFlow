// Worker process: BullMQ consumers (outbox.events, certificate.generate,
// whatsapp.send, sla.check) and the outbox relay. Run as many as you like
// (`--scale worker=3`): every job and the relay are safe to run concurrently.
import { closeQueues, closeRealtime, closeRedis, ensureBucketWithRetry, getConfig, logger, prisma, startWorkers } from '@certiflow/server';

async function main() {
  getConfig(); // fail fast on bad configuration
  await ensureBucketWithRetry();
  const handles = await startWorkers();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'worker shutting down (finishing active jobs)');
    // Worker.close() waits for in-flight jobs; anything killed harder is retried by
    // BullMQ's stalled-job check, and every processor is idempotent.
    await handles.close();
    await closeRealtime();
    await closeQueues();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
