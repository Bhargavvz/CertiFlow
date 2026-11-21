import { Redis } from 'ioredis';
import { getConfig } from './config';

/** BullMQ requires maxRetriesPerRequest: null on its connections; harmless elsewhere. */
export function createRedis(purpose: string): Redis {
  return new Redis(getConfig().REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName: `certiflow-${purpose}`,
  });
}

let shared: Redis | undefined;

/** Shared connection for cache and rate-limit commands. */
export function redis(): Redis {
  if (!shared) shared = createRedis('shared');
  return shared;
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit().catch(() => undefined);
    shared = undefined;
  }
}
