import { Router } from 'express';
import { prisma, redis } from '@certiflow/server';
import { registry } from '../metrics';

export function healthRouter(): Router {
  const r = Router();

  /** Liveness: the process is up. */
  r.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Readiness: dependencies answer. A load balancer should stop routing if this fails. */
  r.get('/readyz', async (_req, res) => {
    const checks: Record<string, string> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch (err) {
      checks.postgres = (err as Error).message;
    }
    try {
      await redis().ping();
      checks.redis = 'ok';
    } catch (err) {
      checks.redis = (err as Error).message;
    }
    const ready = Object.values(checks).every((v) => v === 'ok');
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks });
  });

  r.get('/metrics', async (_req, res) => {
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  return r;
}
