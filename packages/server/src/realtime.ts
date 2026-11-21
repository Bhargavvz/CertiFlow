// Realtime fan-out. The worker publishes through the Socket.IO Redis emitter; every
// API instance (running the Redis adapter) receives it and pushes to its sockets.
// So it does not matter which API instance a browser is connected to.
import { Emitter } from '@socket.io/redis-emitter';
import { REALTIME_CHANNEL, type AuthUser, type EventType, type RealtimeMessage } from '@certiflow/shared';
import { logger } from './logger';
import { createRedis } from './redis';

export function roomsForUser(user: AuthUser): string[] {
  switch (user.role) {
    case 'CENTRE':
      return user.centreId ? [`centre:${user.centreId}`] : [];
    case 'DISTRICT_OFFICER':
      return user.districtId ? [`district:${user.districtId}`] : [];
    case 'QUALITY':
      return ['quality'];
    case 'STATE':
      return ['state'];
  }
}

export function roomsForEvent(type: EventType, payload: Record<string, unknown>): string[] {
  const rooms = new Set<string>(['state']);
  if (typeof payload.centreId === 'string') rooms.add(`centre:${payload.centreId}`);
  if (typeof payload.districtId === 'string') rooms.add(`district:${payload.districtId}`);
  // Quality reviews large batches state-wide; it only needs batch-level events.
  if (type.startsWith('Batch')) rooms.add('quality');
  return [...rooms];
}

let emitter: Emitter | undefined;
let emitterRedis: ReturnType<typeof createRedis> | undefined;

export async function closeRealtime(): Promise<void> {
  await emitterRedis?.quit().catch(() => undefined);
  emitter = undefined;
  emitterRedis = undefined;
}

export function publishRealtime(type: EventType, payload: Record<string, unknown>): void {
  try {
    if (!emitter) {
      emitterRedis = createRedis('socket-emitter');
      emitter = new Emitter(emitterRedis);
    }
    const message: RealtimeMessage = { type, payload, at: new Date().toISOString() };
    emitter.to(roomsForEvent(type, payload)).emit(REALTIME_CHANNEL, message);
  } catch (err) {
    // Realtime is best-effort; the data is already safely in Postgres.
    logger.warn({ err: (err as Error).message, type }, 'realtime publish failed');
  }
}
