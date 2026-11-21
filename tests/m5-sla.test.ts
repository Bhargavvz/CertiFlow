/**
 * Proves Moment 5 - SLA breach: a batch left in a review queue longer than the SLA is
 * escalated automatically by a scheduled job (not by a person): SlaBreached event for
 * the State office's realtime feed, and it shows on GET /state/stuck.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { QUEUE, prisma, scheduleSlaCheck, startWorkers, sweepSla, type WorkerHandles } from '@certiflow/server';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch, waitFor } from './helpers';

let refs: ReferenceData;
let workers: WorkerHandles | undefined;

afterAll(async () => {
  await workers?.close();
});

describe('M5: SLA escalation', () => {
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('a delayed sla.check job (SLA = 1s) flags the batch, emits SlaBreached and it appears on /state/stuck', async () => {
    workers = await startWorkers({ queues: [QUEUE.sla], relay: false, sweep: false });
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    await scheduleSlaCheck({ batchId: batch.id, status: batch.status, stepEnteredAt: batch.currentStepEnteredAt!.toISOString() }, 1000);

    await waitFor(async () => (await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).slaBreachedAt !== null, {
      timeoutMs: 10_000,
      what: 'SLA breach to be recorded',
    });

    expect(await prisma.outboxEvent.count({ where: { type: 'SlaBreached' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { batchId: batch.id, action: 'SLA_BREACHED', actorRole: 'SYSTEM' } })).toBe(1);

    const farah = await loginAs('farah');
    const stuck = await farah.get('/api/v1/state/stuck');
    expect(stuck.status).toBe(200);
    expect(stuck.body.breached.map((b: { id: string }) => b.id)).toContain(batch.id);

    // Only the State office sees the dashboard.
    const dev = await loginAs('dev');
    await dev.get('/api/v1/state/stuck').expect(403);

    await workers.close();
    workers = undefined;
  });

  it('the periodic sweep catches anything a lost delayed job missed, and escalates only once', async () => {
    const stale = await makeBatch(refs, { status: 'PENDING_STATE', stepEnteredAt: new Date(Date.now() - 5_000) });
    const fresh = await makeBatch(refs, { status: 'PENDING_STATE' });

    expect(await sweepSla(new Date(), 1000)).toBe(1);
    expect(await sweepSla(new Date(), 1000)).toBe(0);

    expect((await prisma.batch.findUniqueOrThrow({ where: { id: stale.id } })).slaBreachedAt).not.toBeNull();
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: fresh.id } })).slaBreachedAt).toBeNull();
    expect(await prisma.outboxEvent.count({ where: { type: 'SlaBreached' } })).toBe(1);
  });

  it('a stale SLA job for a batch that has since moved on does nothing', async () => {
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT', stepEnteredAt: new Date(Date.now() - 5_000), districtApprovalsBy: ['dev'] });
    const enteredAt = batch.currentStepEnteredAt!.toISOString();

    // Meera approves -> batch moves to PENDING_STATE (new step entry, SLA clock restarts).
    const meera = await loginAs('meera');
    await meera.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(batch.version)).send({ action: 'approve' }).expect(200);

    const { handleSlaCheckJob } = await import('@certiflow/server');
    expect(await handleSlaCheckJob({ batchId: batch.id, status: 'PENDING_DISTRICT', stepEnteredAt: enteredAt, slaMs: 1000 })).toBe(false);
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).slaBreachedAt).toBeNull();
  });
});
