/**
 * Proves Moment 3 - 60-candidate issuance over an unreliable WhatsApp provider:
 * every candidate gets exactly one certificate and exactly one successful delivery,
 * despite injected 500s, timeouts (some of which the provider actually processed)
 * and 429s. Then simulates a worker crash/restart by re-enqueueing every job:
 * still exactly 60 certificates and 60 messages.
 *
 * Runs the real pieces in-process: API (for webhooks), mock provider, BullMQ
 * workers and the outbox relay, against real Postgres, Redis and MinIO.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isValidCertificateNumber } from '@certiflow/shared';
import { QUEUE, ensureBucket, getConfig, getQueue, prisma, startWorkers, type WorkerHandles } from '@certiflow/server';
import { createMockWhatsapp } from '../apps/mock-whatsapp/src/app';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch, testApp, waitFor } from './helpers';

let refs: ReferenceData;
let apiServer: http.Server;
let mockServer: http.Server;
let mock: ReturnType<typeof createMockWhatsapp>;
let workers: WorkerHandles;

beforeAll(async () => {
  refs = await freshWorld();
  await ensureBucket();

  apiServer = http.createServer(testApp());
  await new Promise<void>((r) => apiServer.listen(0, '127.0.0.1', r));
  const apiPort = (apiServer.address() as AddressInfo).port;

  mock = createMockWhatsapp({
    webhookUrl: `http://127.0.0.1:${apiPort}/api/v1/webhooks/whatsapp`,
    webhookSecret: getConfig().WHATSAPP_WEBHOOK_SECRET,
    fail500: 0.2,
    failTimeout: 0.1,
    fail429: 0.05,
    webhookFail: 0, // provider-side delivery failures are covered separately
    latencyMinMs: 0,
    latencyMaxMs: 20,
    webhookDelayMs: 50,
    hangMs: 1000, // longer than the client's 400ms timeout
  });
  const mockPort = Number(new URL(getConfig().WHATSAPP_API_URL).port);
  mockServer = mock.app.listen(mockPort, '127.0.0.1');
  await new Promise<void>((r) => mockServer.once('listening', () => r()));

  workers = await startWorkers({ sweep: false });
}, 60_000);

afterAll(async () => {
  await workers?.close();
  mock?.close();
  mockServer?.closeAllConnections();
  await new Promise((r) => mockServer?.close(r));
  await new Promise((r) => apiServer?.close(r));
});

async function queuesIdle(): Promise<boolean> {
  for (const name of [QUEUE.events, QUEUE.certificateGenerate, QUEUE.whatsappSend]) {
    const c = await getQueue(name).getJobCounts('waiting', 'active', 'delayed', 'prioritized');
    if ((c.waiting ?? 0) + (c.active ?? 0) + (c.delayed ?? 0) + (c.prioritized ?? 0) > 0) return false;
  }
  return (await prisma.outboxEvent.count({ where: { publishedAt: null } })) === 0;
}

describe('M3: exactly-once issuance and delivery for a 60-candidate batch', () => {
  it(
    'issues 60 certificates and delivers 60 messages despite provider failures',
    async () => {
      const batch = await makeBatch(refs, { status: 'PENDING_STATE', candidates: 60, districtApprovalsBy: ['dev', 'meera'] });
      const farah = await loginAs('farah');
      const res = await farah.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(batch.version)).send({ action: 'approve' });
      expect(res.status).toBe(200);
      expect(res.body.batch.status).toBe('APPROVED');

      await waitFor(async () => (await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status === 'ISSUED', {
        timeoutMs: 100_000,
        intervalMs: 250,
        what: 'batch to reach ISSUED',
      });

      const certs = await prisma.certificate.findMany({ where: { batchId: batch.id } });
      expect(certs).toHaveLength(60);
      expect(new Set(certs.map((c) => c.certificateNumber)).size).toBe(60);
      expect(new Set(certs.map((c) => c.candidateId)).size).toBe(60);
      expect(certs.every((c) => isValidCertificateNumber(c.certificateNumber))).toBe(true);

      const deliveries = await prisma.delivery.findMany({ where: { certificate: { batchId: batch.id } } });
      expect(deliveries).toHaveLength(60);
      expect(deliveries.every((d) => d.status === 'DELIVERED')).toBe(true);

      // The provider created exactly one message per delivery, so each phone got exactly one.
      expect(mock.messages.size).toBe(60);
      expect(new Set(deliveries.map((d) => d.idempotencyKey))).toEqual(new Set(mock.messages.keys()));
      const perPhone = new Map<string, number>();
      for (const m of mock.messages.values()) perPhone.set(m.to, (perPhone.get(m.to) ?? 0) + 1);
      expect([...perPhone.values()].every((n) => n === 1)).toBe(true);

      // Failures really were injected and survived (otherwise this test proves nothing).
      const s = mock.stats;
      expect(s.injected500 + s.injectedTimeouts + s.injected429).toBeGreaterThan(0);
      expect(await prisma.deliveryAttempt.count()).toBeGreaterThan(60);

      // --- Crash/restart simulation: every job is delivered again (new job ids). ---
      const candidates = await prisma.candidate.findMany({ where: { batchId: batch.id } });
      await getQueue(QUEUE.certificateGenerate).addBulk(
        candidates.map((c) => ({ name: 'generate', data: { batchId: batch.id, candidateId: c.id }, opts: { jobId: `replay__${c.id}` } })),
      );
      await getQueue(QUEUE.whatsappSend).addBulk(
        deliveries.map((d) => ({ name: 'send', data: { deliveryId: d.id }, opts: { jobId: `replay__${d.id}` } })),
      );
      await getQueue(QUEUE.events).add('BatchFinalApproved', { type: 'BatchFinalApproved', payload: { batchId: batch.id } }, { jobId: `replay__final__${batch.id}` });

      await waitFor(queuesIdle, { timeoutMs: 30_000, intervalMs: 200, what: 'queues to drain after replay' });

      expect(await prisma.certificate.count({ where: { batchId: batch.id } })).toBe(60);
      expect(await prisma.delivery.count({ where: { certificate: { batchId: batch.id }, status: 'DELIVERED' } })).toBe(60);
      expect(mock.messages.size).toBe(60);
      expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status).toBe('ISSUED');
    },
    120_000,
  );

  it('provider-reported failures: resend with new keys, give up after 3 tries (DLQ), State retry completes the batch', async () => {
    mock.options.fail500 = 0;
    mock.options.failTimeout = 0;
    mock.options.fail429 = 0;
    mock.options.webhookFail = 1; // every receipt says "failed"
    const before = mock.messages.size;

    const batch = await makeBatch(refs, { status: 'PENDING_STATE', candidates: 3 });
    const farah = await loginAs('farah');
    await farah.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(batch.version)).send({ action: 'approve' }).expect(200);

    await waitFor(async () => (await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status === 'PARTIALLY_ISSUED', {
      timeoutMs: 30_000,
      what: 'batch to be PARTIALLY_ISSUED',
    });
    let deliveries = await prisma.delivery.findMany({ where: { certificate: { batchId: batch.id } } });
    expect(deliveries.every((d) => d.status === 'DEAD' && d.generation === 3)).toBe(true);
    expect(mock.messages.size - before).toBe(9); // 3 generations x 3 candidates, one message per key

    // The State office fixes the outage and re-drives the dead deliveries.
    mock.options.webhookFail = 0;
    const retry = await farah.post(`/api/v1/batches/${batch.id}/deliveries/retry-dead`);
    expect(retry.status).toBe(200);
    expect(retry.body.retried).toBe(3);

    await waitFor(async () => (await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).status === 'ISSUED', {
      timeoutMs: 30_000,
      what: 'batch to be ISSUED after retry',
    });
    deliveries = await prisma.delivery.findMany({ where: { certificate: { batchId: batch.id } } });
    expect(deliveries.every((d) => d.status === 'DELIVERED' && d.generation === 4)).toBe(true);
    expect(mock.messages.size - before).toBe(12);
    expect(await prisma.certificate.count({ where: { batchId: batch.id } })).toBe(3);
  }, 90_000);
});
