// Test environment. `??=` so docker-compose.test.yml can point at its own services;
// the defaults match the ports that compose file publishes on the host.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.DATABASE_URL ??= 'postgresql://certiflow:certiflow@localhost:5433/certiflow_test';
process.env.REDIS_URL ??= 'redis://localhost:6380/0';
process.env.S3_ENDPOINT ??= 'http://localhost:9002';
process.env.S3_ACCESS_KEY ??= 'certiflow';
process.env.S3_SECRET_KEY ??= 'certiflow-secret';
process.env.S3_BUCKET ??= 'certificates-test';
process.env.JWT_SECRET ??= 'test-only-jwt-secret-0123456789-abcdefghij';
process.env.WHATSAPP_WEBHOOK_SECRET ??= 'test-only-webhook-secret-0123456789';
process.env.DOWNLOAD_TOKEN_SECRET ??= 'test-only-download-secret-0123456789';
process.env.PUBLIC_WEB_URL ??= 'http://localhost:8080';
// The M3 test starts the mock provider in-process on this port.
process.env.WHATSAPP_API_URL ??= 'http://127.0.0.1:4555';
process.env.WHATSAPP_TIMEOUT_MS ??= '400';
process.env.WHATSAPP_MAX_ATTEMPTS ??= '15';
process.env.RETRY_BASE_MS ??= '50';
process.env.RETRY_MAX_MS ??= '400';
process.env.OUTBOX_POLL_MS ??= '50';
process.env.SLA_SWEEP_EVERY_MS ??= '3600000';
process.env.RATE_LIMIT_VERIFY_PER_MIN ??= '10000';
process.env.RATE_LIMIT_DOWNLOAD_PER_MIN ??= '10000';
process.env.RATE_LIMIT_LOGIN_PER_MIN ??= '10000';
process.env.CERT_CONCURRENCY ??= '8';
process.env.SEND_CONCURRENCY ??= '20';

export {};
