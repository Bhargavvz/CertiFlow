/**
 * Proves "Never - untraceable decision": every state change writes an audit row
 * (actor, role, action, from -> to, reason, correlation id) in the SAME transaction,
 * failed changes leave no audit row, and the audit log is append-only in Postgres.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@certiflow/server';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch } from './helpers';

let refs: ReferenceData;
const version = async (id: string) => (await prisma.batch.findUniqueOrThrow({ where: { id } })).version;

describe('Never: untraceable decisions', () => {
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('every step of a full workflow has an audit row with actor, transition and correlation id', async () => {
    const [anika, dev, meera, farah] = await Promise.all([loginAs('anika'), loginAs('dev'), loginAs('meera'), loginAs('farah')]);
    const corr = (s: string) => ({ 'X-Correlation-Id': `trace-${s}` });

    const created = await anika.post('/api/v1/batches').set(corr('create')).send({ courseName: 'Plumber General' }).expect(201);
    const id = created.body.batch.id as string;
    const csv = readFileSync(join(process.cwd(), 'samples', 'good_batch.csv'));
    await anika.post(`/api/v1/batches/${id}/candidates/import`).set(corr('import')).attach('file', csv, 'good_batch.csv').expect(200);
    await anika.post(`/api/v1/batches/${id}/submit`).set(corr('submit')).send({}).expect(200);
    await dev.post(`/api/v1/batches/${id}/decisions`).set(corr('dev')).set('If-Match', String(await version(id))).send({ action: 'approve' }).expect(200);
    await meera.post(`/api/v1/batches/${id}/decisions`).set(corr('meera')).set('If-Match', String(await version(id))).send({ action: 'approve' }).expect(200);
    await farah.post(`/api/v1/batches/${id}/decisions`).set(corr('farah')).set('If-Match', String(await version(id))).send({ action: 'approve' }).expect(200);

    const audit = await prisma.auditLog.findMany({ where: { batchId: id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => [a.action, a.actorRole, a.fromState, a.toState, a.correlationId])).toEqual([
      ['BATCH_CREATED', 'CENTRE', null, 'DRAFT', 'trace-create'],
      ['CANDIDATES_IMPORTED', 'CENTRE', 'DRAFT', 'DRAFT', 'trace-import'],
      ['BATCH_SUBMITTED', 'CENTRE', 'DRAFT', 'PENDING_DISTRICT', 'trace-submit'],
      ['BATCH_APPROVED', 'DISTRICT_OFFICER', 'PENDING_DISTRICT', 'PENDING_DISTRICT', 'trace-dev'],
      ['BATCH_APPROVED', 'DISTRICT_OFFICER', 'PENDING_DISTRICT', 'PENDING_STATE', 'trace-meera'],
      ['BATCH_FINAL_APPROVED', 'STATE', 'PENDING_STATE', 'APPROVED', 'trace-farah'],
    ]);
    expect(audit.map((a) => a.actorId)).toEqual([
      refs.users.anika.id,
      refs.users.anika.id,
      refs.users.anika.id,
      refs.users.dev.id,
      refs.users.meera.id,
      refs.users.farah.id,
    ]);

    // The outbox events carry the same correlation ids, so jobs can be traced back.
    const final = await prisma.outboxEvent.findFirstOrThrow({ where: { type: 'BatchFinalApproved' } });
    expect(final.correlationId).toBe('trace-farah');

    // The timeline endpoint shows the same story.
    const timeline = await farah.get(`/api/v1/batches/${id}/timeline`).expect(200);
    expect(timeline.body.items.map((i: { action: string }) => i.action)).toContain('BATCH_FINAL_APPROVED');
  });

  it('a rejected or failed action leaves no audit row and no event', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    const before = { audit: await prisma.auditLog.count(), events: await prisma.outboxEvent.count() };
    const anika = await loginAs('anika');
    const after0 = await prisma.auditLog.count(); // login itself is audited
    await anika.post(`/api/v1/batches/${b.id}/decisions`).set('If-Match', String(b.version)).send({ action: 'approve' }).expect(403);
    const dev = await loginAs('dev');
    const after1 = await prisma.auditLog.count();
    await dev.post(`/api/v1/batches/${b.id}/decisions`).set('If-Match', String(b.version - 1)).send({ action: 'approve' }).expect(409);
    expect(await prisma.auditLog.count()).toBe(after1);
    expect(after0 - before.audit).toBe(1);
    expect(await prisma.outboxEvent.count()).toBe(before.events);
    expect(await prisma.approval.count({ where: { batchId: b.id } })).toBe(0);
  });

  it('the audit log cannot be edited or deleted, and approvals cannot be deleted, even directly in the database', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_DISTRICT', districtApprovalsBy: ['dev'] });
    await prisma.auditLog.create({
      data: { actorRole: 'SYSTEM', action: 'TEST', entityType: 'BATCH', entityId: b.id, batchId: b.id, correlationId: 'x' },
    });
    await expect(prisma.auditLog.updateMany({ data: { action: 'REWRITTEN' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(prisma.approval.deleteMany({ where: { batchId: b.id } })).rejects.toThrow(/append-only/);
    expect(await prisma.auditLog.count({ where: { action: 'TEST' } })).toBe(1);
    expect(await prisma.approval.count({ where: { batchId: b.id } })).toBe(1);
  });
});
