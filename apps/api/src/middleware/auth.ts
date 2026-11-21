import type { NextFunction, Request, Response } from 'express';
import type { AuthUser, Role } from '@certiflow/shared';
import { Errors } from '@certiflow/server';
import { SESSION_COOKIE, verifySession } from '../auth/session';

/** Identity comes ONLY from the signed cookie. Headers or body fields claiming a role are ignored. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) throw Errors.unauthorized();
  try {
    req.user = verifySession(token);
  } catch {
    throw Errors.unauthorized('Your session is invalid or has expired. Please sign in again.', 'INVALID_SESSION');
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw Errors.unauthorized();
    if (!roles.includes(req.user.role)) throw Errors.forbidden(`Only ${roles.join(' / ')} can do this`);
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw Errors.unauthorized();
  return req.user;
}
