import pino from 'pino';
import { createMockWhatsapp } from './app';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info', base: { service: 'mock-whatsapp' } });
const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== '' && process.env[name] !== undefined ? v : fallback;
};

const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
if (!secret) {
  log.fatal('WHATSAPP_WEBHOOK_SECRET is required');
  process.exit(1);
}

const mock = createMockWhatsapp({
  webhookUrl: process.env.MOCK_WEBHOOK_URL ?? 'http://localhost:3000/api/v1/webhooks/whatsapp',
  webhookSecret: secret,
  fail500: num('MOCK_FAIL_500', 0.2),
  failTimeout: num('MOCK_FAIL_TIMEOUT', 0.1),
  fail429: num('MOCK_FAIL_429', 0.05),
  webhookFail: num('MOCK_WEBHOOK_FAIL', 0.02),
  latencyMinMs: num('MOCK_LATENCY_MIN_MS', 50),
  latencyMaxMs: num('MOCK_LATENCY_MAX_MS', 400),
  webhookDelayMs: num('MOCK_WEBHOOK_DELAY_MS', 800),
  hangMs: num('MOCK_HANG_MS', 10_000),
});

const port = num('MOCK_PORT', 4000);
const server = mock.app.listen(port, () => log.info({ port, options: { ...mock.options, webhookSecret: '***' } }, 'mock whatsapp listening'));

const shutdown = () => {
  mock.close();
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
