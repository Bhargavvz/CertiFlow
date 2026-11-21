import http from 'node:http';
import { closeQueues, closeRedis, getConfig, logger, prisma } from '@certiflow/server';
import { createApp } from './app';
import { attachRealtime } from './realtime';

async function main() {
  const cfg = getConfig(); // fail fast on bad configuration
  const server = http.createServer(createApp());
  const realtime = attachRealtime(server);

  server.listen(cfg.PORT, () => logger.info({ port: cfg.PORT }, 'api listening'));

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'api shutting down');
    server.close();
    await realtime.close();
    await closeQueues();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'api failed to start');
  process.exit(1);
});
