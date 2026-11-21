import type { PolicyDecision } from '@certiflow/shared';

/** An error that maps directly to an HTTP response: { error: { code, message, details } }. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest: (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details),
  unauthorized: (message = 'Please sign in', code = 'UNAUTHENTICATED') => new AppError(401, code, message),
  forbidden: (message = 'You are not allowed to do this') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (code: string, message: string, details?: unknown) => new AppError(409, code, message, details),
  gone: (message: string) => new AppError(410, 'GONE', message),
  unprocessable: (code: string, message: string, details?: unknown) => new AppError(422, code, message, details),
  preconditionRequired: (message: string) => new AppError(428, 'PRECONDITION_REQUIRED', message),
  tooManyRequests: (message = 'Too many requests, slow down') => new AppError(429, 'RATE_LIMITED', message),
};

/** Turn a policy denial into the right HTTP error (403 wrong actor, 409 wrong state, 404 out of sight). */
export function assertAllowed(decision: PolicyDecision): void {
  if (decision.allowed) return;
  switch (decision.code) {
    case 'FORBIDDEN':
      throw Errors.forbidden(decision.reason);
    case 'INVALID_STATE':
      throw Errors.conflict('INVALID_STATE', decision.reason);
    case 'NOT_FOUND':
      throw Errors.notFound(decision.reason);
  }
}
