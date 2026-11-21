import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { IllegalTransitionError } from '@certiflow/shared';
import { AppError, logger } from '@certiflow/server';

/** Every error leaves the API as { error: { code, message, details? }, correlationId }. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const send = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) }, correlationId: req.correlationId });

  if (err instanceof AppError) return void send(err.status, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    return void send(
      400,
      'VALIDATION_FAILED',
      'The request is not valid',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    );
  }

  if (err instanceof IllegalTransitionError) return void send(409, 'INVALID_STATE', err.message);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return void send(413, 'FILE_TOO_LARGE', 'The file is too large');
    return void send(400, 'BAD_UPLOAD', err.message);
  }

  const bodyErr = err as { type?: string; status?: number };
  if (bodyErr.type === 'entity.parse.failed') return void send(400, 'MALFORMED_JSON', 'The request body is not valid JSON');
  if (bodyErr.type === 'entity.too.large') return void send(413, 'BODY_TOO_LARGE', 'The request body is too large');

  logger.error({ err }, 'unhandled error');
  send(500, 'INTERNAL', 'Something went wrong. Quote the correlation id if you report this.');
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` }, correlationId: req.correlationId });
}
