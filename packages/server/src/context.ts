// Carries the correlation id implicitly through async code (HTTP request ->
// service -> audit row -> outbox event -> job -> log line) without threading it
// through every function signature.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  correlationId: string;
}

export const contextStorage = new AsyncLocalStorage<RequestContext>();

export function currentCorrelationId(): string {
  return contextStorage.getStore()?.correlationId ?? 'no-correlation-id';
}

export function withCorrelation<T>(correlationId: string | undefined, fn: () => T): T {
  return contextStorage.run({ correlationId: correlationId || randomUUID() }, fn);
}
