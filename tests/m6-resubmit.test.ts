/**
 * Proves Moment 6 - send back & resubmit, per docs/DECISIONS.md D6: on resubmission
 * every earlier decision is superseded (kept, never deleted), the revision goes up,
 * and the batch needs two FRESH district approvals. Also covers officers fixing
 * their own mistake by withdrawing an approval.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@certiflow/server';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch } from './helpers';

let refs: ReferenceData;
const version = async (id: string) => (await prisma.batch.findUniqueOrThrow({ where: { id } })).version;
const status = async (id: string) => (await prisma.batch.findUniqueOrThrow({ where: { id } })).status;

describe('M6: send back and resubmit', () => {
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('supersedes revision-1 decisions and requires two fresh approvals on revision 2', async () => {
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT', districtApprovalsBy: ['dev'] });
    const [dev, meera, kabir, anika] = await Promise.all([loginAs('dev'), loginAs('meera'), loginAs('kabir'), loginAs('anika')]);

    // Meera sends it back with a reason.
    await meera.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(await version(batch.id))).send({ action: 'send_back' }).expect(400); // reason required
    const sentBack = await meera
      .post(`/api/v1/batches/${batch.id}/decisions`)
      .set('If-Match', String(await version(batch.id)))
      .send({ action: 'send_back', reason: 'Row 4 has the wrong passed-on date' });
    expect(sentBack.status).toBe(200);
    expect(sentBack.body.batch.status).toBe('SENT_BACK');
    expect(sentBack.body.batch.sendBackReason).toBe('Row 4 has the wrong passed-on date');

    // Officers cannot act on it while it is with the centre.
    await kabir.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(await version(batch.id))).send({ action: 'approve' }).expect(409);

    // Anika fixes the file and resubmits.
    const csv = readFileSync(join(process.cwd(), 'samples', 'good_batch.csv'));
    await anika.post(`/api/v1/batches/${batch.id}/candidates/import`).attach('file', csv, 'good_batch.csv').expect(200);
    const resubmitted = await anika.post(`/api/v1/batches/${batch.id}/resubmit`).send({ version: await version(batch.id) });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.batch.status).toBe('PENDING_DISTRICT');
    expect(resubmitted.body.batch.revision).toBe(2);
    expect(resubmitted.body.batch.sendBackReason).toBeNull();

    // Revision-1 decisions are kept but superseded.
    const rev1 = await prisma.approval.findMany({ where: { batchId: batch.id, revision: 1 } });
    expect(rev1).toHaveLength(2); // Dev's approval + Meera's send-back
    expect(rev1.every((a) => a.superseded)).toBe(true);

    // Dev's old approval does not count: one fresh approval is not enough...
    await dev.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(await version(batch.id))).send({ action: 'approve' }).expect(200);
    expect(await status(batch.id)).toBe('PENDING_DISTRICT');
    // ...a second distinct officer moves it on (10 candidates < 50, so straight to State).
    await kabir.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(await version(batch.id))).send({ action: 'approve' }).expect(200);
    expect(await status(batch.id)).toBe('PENDING_STATE');

    const rev2 = await prisma.approval.findMany({ where: { batchId: batch.id, revision: 2, superseded: false } });
    expect(rev2.map((a) => a.officerId).sort()).toEqual([refs.users.dev.id, refs.users.kabir.id].sort());
    expect(await prisma.auditLog.count({ where: { batchId: batch.id, action: 'APPROVALS_SUPERSEDED' } })).toBe(1);
  });

  it('resubmission is only possible from SENT_BACK and only by the owning centre', async () => {
    const batch = await makeBatch(refs, { status: 'SENT_BACK' });
    const ravi = await loginAs('ravi');
    await ravi.post(`/api/v1/batches/${batch.id}/resubmit`).send({}).expect(403);
    const anika = await loginAs('anika');
    await anika.post(`/api/v1/batches/${batch.id}/resubmit`).send({}).expect(200);
    await anika.post(`/api/v1/batches/${batch.id}/resubmit`).send({}).expect(409);
  });

  it('an officer can withdraw their own approval while still at the district step, not after', async () => {
    const batch = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    const [dev, meera] = await Promise.all([loginAs('dev'), loginAs('meera')]);

    await dev.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(await version(batch.id))).send({ action: 'approve' }).expect(200);
    await dev.delete(`/api/v1/batches/${batch.id}/approvals/mine`).expect(200);
    expect(await prisma.approval.count({ where: { batchId: batch.id, withdrawnAt: null } })).toBe(0);
    expect(await prisma.approval.count({ where: { batchId: batch.id } })).toBe(1); // kept for the record
    expect(await prisma.auditLog.count({ where: { batchId: batch.id, action: 'APPROVAL_WITHDRAWN' } })).toBe(1);

    // Meera cannot withdraw Dev's approval (she has none of her own).
    await meera.delete(`/api/v1/batches/${batch.id}/approvals/mine`).expect(404);

    // Dev approves again, Meera approves -> moves on; now withdrawal is refused.
    await dev.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(await version(batch.id))).send({ action: 'approve' }).expect(200);
    await meera.post(`/api/v1/batches/${batch.id}/decisions`).set('If-Match', String(await version(batch.id))).send({ action: 'approve' }).expect(200);
    expect(await status(batch.id)).toBe('PENDING_STATE');
    await dev.delete(`/api/v1/batches/${batch.id}/approvals/mine`).expect(409);
  });
});
