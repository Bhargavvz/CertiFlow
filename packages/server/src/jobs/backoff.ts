import { getConfig } from '../config';
import { ProviderError } from '../services/whatsappClient';

/**
 * Retry delay for WhatsApp sends: exponential backoff with "equal jitter" (half fixed,
 * half random) so 30,000 failed sends do not all retry in the same millisecond, and
 * the provider's Retry-After wins when it tells us how long to wait.
 */
export function deliveryBackoff(attemptsMade: number, _type?: string, err?: Error): number {
  if (err instanceof ProviderError && err.retryAfterMs) {
    return err.retryAfterMs + Math.round(Math.random() * 250);
  }
  const cfg = getConfig();
  const exp = Math.min(cfg.RETRY_MAX_MS, cfg.RETRY_BASE_MS * 2 ** Math.max(0, attemptsMade - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}
