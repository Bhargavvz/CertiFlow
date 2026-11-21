// All configuration comes from the environment and is validated once at startup,
// so a missing secret fails fast with a clear message instead of a 3 a.m. surprise.
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === undefined ? undefined : v),
  z.coerce.number().positive().optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  PORT: z.coerce.number().int().default(3000),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379/0'),

  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(8 * 3600),
  COOKIE_SECURE: bool.default('false'),
  DEMO_LOGIN_ENABLED: bool.default('true'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:8080,http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:8080'),

  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('certiflow'),
  S3_SECRET_KEY: z.string().default('certiflow-secret'),
  S3_BUCKET: z.string().default('certificates'),

  WHATSAPP_API_URL: z.string().url().default('http://localhost:4000'),
  WHATSAPP_API_TOKEN: z.string().default('demo-provider-token'),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(16),
  WHATSAPP_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  WHATSAPP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(8),
  RETRY_BASE_MS: z.coerce.number().int().positive().default(1000),
  RETRY_MAX_MS: z.coerce.number().int().positive().default(60_000),

  DOWNLOAD_TOKEN_SECRET: z.string().min(16),

  QUALITY_THRESHOLD: z.coerce.number().int().positive().default(50),
  SLA_HOURS: z.coerce.number().positive().default(48),
  SLA_OVERRIDE_SECONDS: optionalNumber,
  SLA_SWEEP_EVERY_MS: z.coerce.number().int().positive().default(30_000),

  VERIFY_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_VERIFY_PER_MIN: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_DOWNLOAD_PER_MIN: z.coerce.number().int().positive().default(30),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  MAX_IMPORT_ROWS: z.coerce.number().int().positive().default(1000),

  OUTBOX_POLL_MS: z.coerce.number().int().positive().default(250),
  CERT_CONCURRENCY: z.coerce.number().int().positive().default(4),
  SEND_CONCURRENCY: z.coerce.number().int().positive().default(10),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function getConfig(): Config {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new Error(`Invalid environment configuration: ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** SLA in milliseconds. SLA_OVERRIDE_SECONDS lets a demo use 2 minutes instead of 48 hours. */
export function slaMs(cfg: Config = getConfig()): number {
  return cfg.SLA_OVERRIDE_SECONDS ? cfg.SLA_OVERRIDE_SECONDS * 1000 : cfg.SLA_HOURS * 3600_000;
}
