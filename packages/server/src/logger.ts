import pino from 'pino';
import { contextStorage } from './context';

// Structured JSON logs. Every line automatically gets the current correlationId.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: process.env.SERVICE_NAME ?? 'certiflow' },
  mixin() {
    const correlationId = contextStorage.getStore()?.correlationId;
    return correlationId ? { correlationId } : {};
  },
  // Never log personal data or secrets even if someone passes them by mistake.
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.phone', '*.token', '*.downloadToken'],
});
