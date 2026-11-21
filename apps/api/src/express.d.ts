import type { AuthUser } from '@certiflow/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set only by the authenticate middleware from a verified JWT. */
      user?: AuthUser;
      correlationId?: string;
    }
  }
}

export {};
