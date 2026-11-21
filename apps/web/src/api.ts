// Thin fetch wrapper. The session is an httpOnly cookie, so JS never sees the token.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly correlationId?: string,
  ) {
    super(message);
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit;
}

export async function api<T>(path: string, { json, headers, ...init }: RequestOptions = {}): Promise<T> {
  const h = new Headers(headers);
  let body = init.body;
  if (json !== undefined) {
    h.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }
  const res = await fetch(`/api/v1${path}`, { ...init, headers: h, body, credentials: 'include' });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown }; correlationId?: string }) ?? {};
    throw new ApiError(res.status, e.error?.code ?? 'ERROR', e.error?.message ?? res.statusText, e.error?.details, e.correlationId);
  }
  return data as T;
}
