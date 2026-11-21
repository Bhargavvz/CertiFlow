import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { contextStorage, logger } from '@certiflow/server';
import { httpRequestsTotal } from '../metrics';

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Accept the caller's X-Correlation-Id (if well-formed) or mint one, echo it back,
 * and run the rest of the request inside it so audit rows, outbox events, jobs and
 * logs all share it.
 */
export function correlation(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-correlation-id');
  const correlationId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  contextStorage.run({ correlationId }, () => next());
}

/**
 * Body parsers (json, raw, multer) finish on stream events, which can run outside
 * the AsyncLocalStorage context. Re-enter it after them so services still see the id.
 */
export function rebindCorrelation(req: Request, _res: Response, next: NextFunction): void {
  contextStorage.run({ correlationId: req.correlationId ?? randomUUID() }, () => next());
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    httpRequestsTotal.inc({ method: req.method, route, status: String(res.statusCode) });
    contextStorage.run({ correlationId: req.correlationId ?? 'none' }, () =>
      logger.info({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms) }, 'request'),
    );
  });
  next();
}
