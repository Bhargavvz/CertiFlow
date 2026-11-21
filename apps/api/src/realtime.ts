// Socket.IO with the Redis adapter: an event emitted by the worker (via the Redis
// emitter) reaches browsers connected to ANY api instance. Clients use the websocket
// transport only, so no sticky sessions are needed behind a load balancer.
import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { parse as parseCookie } from 'cookie';
import { Server } from 'socket.io';
import type { AuthUser } from '@certiflow/shared';
import { createRedis, getConfig, logger, roomsForUser } from '@certiflow/server';
import { SESSION_COOKIE, verifySession } from './auth/session';

export function attachRealtime(httpServer: HttpServer) {
  const cfg = getConfig();
  const io = new Server(httpServer, {
    path: '/socket.io',
    transports: ['websocket'],
    cors: { origin: cfg.CORS_ORIGINS, credentials: true },
  });
  const pub = createRedis('socket-pub');
  const sub = createRedis('socket-sub');
  io.adapter(createAdapter(pub, sub));

  // Same rule as HTTP: identity only from the signed session cookie.
  io.use((socket, next) => {
    try {
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const token = cookies[SESSION_COOKIE];
      if (!token) return next(new Error('unauthorized'));
      socket.data.user = verifySession(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    const rooms = roomsForUser(user);
    void socket.join(rooms);
    socket.emit('certiflow:hello', { rooms });
    logger.debug({ userId: user.id, rooms }, 'socket connected');
  });

  return {
    io,
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await Promise.all([pub.quit().catch(() => undefined), sub.quit().catch(() => undefined)]);
    },
  };
}
