/**
 * Proves Moment 2 - concurrent approvals: two officers approve the same batch at the
 * same instant -> the batch advances exactly once, exactly one BatchApproved event,
 * no duplicate approval. (Optimistic locking on Batch.version + partial unique index.)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { decide, prisma } from '@certiflow/server';
import type { AuthUser } from '@certiflow/shared';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch } from './helpers';

let refs: ReferenceData;
const asAuth = (key: 'dev' | 'meera' | 'kabir'): AuthUser => {
  const u = refs.users[key];
  return { id: u.id, role: u.role, name: u.name, centreId: u.centreId, districtId: u.districtId };
};

describe('M2: concurrent approvals advance the batch exactly once', () => {
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('two officers approving simultaneously (over HTTP) -> one 200, one 409, one transition', async () => {
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT', districtApprovalsBy: ['dev'] });
    const [meera, kabir] = await Promise.all([loginAs('meera'), loginAs('kabir')]);

    const [a, b] = await Promise.all([
      meera.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(batch.version)).send({ action: 'approve' }),
      kabir.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(batch.version)).send({ action: 'approve' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('VERSION_CONFLICT');

    const after = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(after.status).toBe('PENDING_STATE'); // 5 candidates < quality threshold
    expect(after.version).toBe(batch.version + 1);

    const live = await prisma.approval.count({ where: { batchId: batch.id, superseded: false, withdrawnAt: null } });
    expect(live).toBe(2); // Dev + the winner; the loser's insert was rolled back
    expect(await prisma.outboxEvent.count({ where: { type: 'BatchApproved' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { batchId: batch.id, action: 'BATCH_APPROVED' } })).toBe(1);
  });

  it('many parallel attempts at the service level still produce exactly one transition', async () => {
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT', districtApprovalsBy: ['dev'] });
    const attempts = await Promise.allSettled(
      [asAuth('meera'), asAuth('kabir'), asAuth('meera'), asAuth('kabir')].map((u) =>
        decide(u, batch.id, { action: 'approve', version: batch.version }),
      ),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const after = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(after.status).toBe('PENDING_STATE');
    expect(await prisma.outboxEvent.count({ where: { type: 'BatchApproved' } })).toBe(1);
  });

  it('the same officer double-clicking approve counts once', async () => {
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    const dev = await loginAs('dev');
    const [a, b] = await Promise.all([
      dev.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(batch.version)).send({ action: 'approve' }),
      dev.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(batch.version)).send({ action: 'approve' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.approval.count({ where: { batchId: batch.id } })).toBe(1);
    const after = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(after.status).toBe('PENDING_DISTRICT'); // still needs a second, different officer
  });

  it('a decision without the reviewed version is refused (428)', async () => {
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    const dev = await loginAs('dev');
    const res = await dev.post(`/api/v1/batches/${batch.id}/decisions`).send({ action: 'approve' });
    expect(res.status).toBe(428);
  });
});
