// Central API client. The session is an httpOnly cookie, so JS never sees the token.
// Every failure becomes an ApiError with a code, a friendly message, the server's
// correlationId (for support) and, on 429, how long to wait.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly correlationId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit;
}

/** Called on any 401 except the "who am I" probe, so the app can drop to the login screen. */
let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(fn: () => void) {
  onUnauthenticated = fn;
}

export async function api<T>(path: string, { json, headers, ...init }: RequestOptions = {}): Promise<T> {
  const h = new Headers(headers);
  let body = init.body;
  if (json !== undefined) {
    h.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { ...init, headers: h, body, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach CertiFlow. Check your connection and try again.");
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; details?: unknown };
    correlationId?: string;
  };
  if (!res.ok) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const err = new ApiError(
      res.status,
      data.error?.code ?? 'ERROR',
      data.error?.message ?? res.statusText,
      data.error?.details,
      data.correlationId ?? res.headers.get('x-correlation-id') ?? undefined,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
    if (res.status === 401 && path !== '/auth/me' && path !== '/auth/demo-login') onUnauthenticated?.();
    throw err;
  }
  return data as T;
}

/**
 * Turn any error into one sentence a non-technical user can act on. The server's
 * own messages are already written for people (e.g. "You have already approved this
 * batch…"), so they are used where they exist.
 */
export function friendlyMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something unexpected happened. Please try again.';
  switch (e.status) {
    case 0:
      return e.message;
    case 401:
      return 'Your session has ended. Please sign in again.';
    case 403:
      return e.message || "You don't have permission to do this.";
    case 404:
      return 'We couldn’t find that. It may have been removed, or you may not have access.';
    case 409:
      return e.code === 'VERSION_CONFLICT' ? 'Someone else changed this a moment ago. We’ve refreshed it, please check and try again.' : e.message;
    case 410:
      return e.message;
    case 413:
      return 'That file is too large. The limit is 2 MB.';
    case 422:
      return e.message;
    case 428:
      return 'Please refresh the page and try again.';
    case 429:
      return e.retryAfterSeconds
        ? `Too many requests. Please wait ${e.retryAfterSeconds} seconds and try again.`
        : 'Too many requests. Please wait a moment and try again.';
    default:
      return e.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : e.message;
  }
}
