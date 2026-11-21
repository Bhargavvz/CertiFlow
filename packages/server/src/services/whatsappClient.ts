import { getConfig } from '../config';

export type ProviderErrorKind = 'timeout' | 'server' | 'rate_limited' | 'client' | 'network';

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: ProviderErrorKind,
    public readonly httpStatus?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  /** 4xx other than 429 means our request is wrong; retrying will not help. */
  get retryable(): boolean {
    return this.kind !== 'client';
  }
}

export interface OutgoingMessage {
  to: string;
  text: string;
  link: string;
}

export interface SendResult {
  messageId: string;
  replayed: boolean;
  httpStatus: number;
}

/**
 * One HTTP call to the provider. The Idempotency-Key makes retries safe: if a
 * previous attempt actually reached the provider but we never saw the response
 * (timeout), the provider returns the original message instead of sending again.
 */
export async function sendWhatsapp(message: OutgoingMessage, idempotencyKey: string): Promise<SendResult> {
  const cfg = getConfig();
  let res: Response;
  try {
    res = await fetch(`${cfg.WHATSAPP_API_URL}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
        authorization: `Bearer ${cfg.WHATSAPP_API_TOKEN}`,
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(cfg.WHATSAPP_TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ProviderError(`provider did not answer within ${cfg.WHATSAPP_TIMEOUT_MS}ms`, 'timeout');
    }
    throw new ProviderError(`network error: ${(err as Error).message}`, 'network');
  }

  if (res.status === 200 || res.status === 202) {
    let body: { messageId?: string };
    try {
      body = (await res.json()) as { messageId?: string };
    } catch {
      throw new ProviderError('provider response body was unreadable', 'timeout');
    }
    if (!body.messageId) throw new ProviderError('provider response had no messageId', 'server', res.status);
    return { messageId: body.messageId, replayed: res.headers.get('idempotent-replayed') === 'true', httpStatus: res.status };
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after') ?? '1');
    throw new ProviderError('rate limited by provider', 'rate_limited', 429, (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000);
  }
  if (res.status >= 500) throw new ProviderError(`provider error ${res.status}`, 'server', res.status);
  throw new ProviderError(`provider rejected the request (${res.status})`, 'client', res.status);
}
