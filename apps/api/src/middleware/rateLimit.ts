// Fixed-window rate limiter in Redis (INCR + EXPIRE). Shared across all API
// instances, so scaling out does not multiply the allowance.
import type { NextFunction, Request, Response } from 'express';
import { Errors, logger, redis } from '@certiflow/server';

export function rateLimit(name: string, limitPerMinute: () => number) {
  const windowSeconds = 60;
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const limit = limitPerMinute();
    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${name}:${req.ip}:${window}`;
    let count: number;
    try {
      count = await redis().incr(key);
      if (count === 1) await redis().expire(key, windowSeconds);
    } catch (err) {
      // Fail open: verification must stay available if Redis blips. Logged loudly.
      logger.error({ err: (err as Error).message, limiter: name }, 'rate limiter unavailable');
      return next();
    }
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)));
    if (count > limit) {
      res.setHeader('Retry-After', String(windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds)));
      return next(Errors.tooManyRequests());
    }
    next();
  };
}
