import { afterAll } from 'vitest';
import { closeQueues, closeRealtime, closeRedis, prisma } from '@certiflow/server';

// Each test file gets its own module instances; release their connections when done.
afterAll(async () => {
  await closeRealtime();
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();
});
