/**
 * Proves "Never - wrong actor": acting at a step that is not yours is a 403, and
 * identity comes only from the verified token, never from the request body/headers.
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getConfig, prisma } from '@certiflow/server';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch, testApp } from './helpers';

let refs: ReferenceData;
const decide = (agent: Awaited<ReturnType<typeof loginAs>>, id: string, version: number, body: object = { action: 'approve' }) =>
  agent.post(`/api/v1/batches/${id}/decisions`).set('If-Match', String(version)).send(body);

async function unchanged(id: string, status: string, version: number) {
  const b = await prisma.batch.findUniqueOrThrow({ where: { id } });
  expect(b.status).toBe(status);
  expect(b.version).toBe(version);
}

describe('Never: wrong actor', () => {
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('a training centre cannot approve (403)', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    const res = await decide(await loginAs('anika'), b.id, b.version);
    expect(res.status).toBe(403);
    await unchanged(b.id, 'PENDING_DISTRICT', b.version);
  });

  it('an officer from another district cannot approve (403)', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    const res = await decide(await loginAs('isha'), b.id, b.version);
    expect(res.status).toBe(403);
    await unchanged(b.id, 'PENDING_DISTRICT', b.version);
  });

  it('the same officer approving twice does not count as two approvals (409)', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    const dev = await loginAs('dev');
    await decide(dev, b.id, b.version).expect(200);
    const again = await decide(dev, b.id, b.version + 1);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_APPROVED');
    expect(await prisma.approval.count({ where: { batchId: b.id } })).toBe(1);
    expect((await prisma.batch.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('PENDING_DISTRICT');
  });

  it('Quality cannot give final approval, and district officers cannot act at later steps (403)', async () => {
    const atState = await makeBatch(refs, { status: 'PENDING_STATE' });
    await decide(await loginAs('neha'), atState.id, atState.version).expect(403);
    await decide(await loginAs('dev'), atState.id, atState.version).expect(403);
    await unchanged(atState.id, 'PENDING_STATE', atState.version);

    const atQuality = await makeBatch(refs, { status: 'PENDING_QUALITY', candidates: 55 });
    await decide(await loginAs('kabir'), atQuality.id, atQuality.version).expect(403);
    await decide(await loginAs('farah'), atQuality.id, atQuality.version).expect(403); // State cannot skip Quality
    await decide(await loginAs('neha'), atQuality.id, atQuality.version).expect(200);
  });

  it('a centre cannot submit or edit another centre batch (403) or even see it (404)', async () => {
    const b = await makeBatch(refs, { status: 'DRAFT', centre: 'AMR-001' });
    const anika = await loginAs('anika');
    await anika.post(`/api/v1/batches/${b.id}/submit`).send({}).expect(403);
    await anika.get(`/api/v1/batches/${b.id}`).expect(404);
    const list = await anika.get('/api/v1/batches').expect(200);
    expect(list.body.batches.map((x: { id: string }) => x.id)).not.toContain(b.id);
  });

  it('a role or user id smuggled into the body is rejected, and a role header is ignored', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_STATE' });
    const anika = await loginAs('anika');
    const smuggled = await decide(anika, b.id, b.version, { action: 'approve', role: 'STATE', officerId: refs.users.farah.id });
    expect(smuggled.status).toBe(400); // unknown fields are refused outright
    const header = await anika
      .post(`/api/v1/batches/${b.id}/decisions`)
      .set('If-Match', String(b.version))
      .set('X-User-Role', 'STATE')
      .set('X-User-Id', refs.users.farah.id)
      .send({ action: 'approve' });
    expect(header.status).toBe(403);
    await unchanged(b.id, 'PENDING_STATE', b.version);

    const login = await request(testApp()).post('/api/v1/auth/demo-login').send({ userKey: 'anika', role: 'STATE' });
    expect(login.status).toBe(400);
  });

  it('forged, tampered, unsigned or missing tokens are 401', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_STATE' });
    const farah = refs.users.farah;
    const claims = { role: 'STATE', name: 'Farah Ali', centreId: null, districtId: null };
    const opts = { subject: farah.id, issuer: 'certiflow', audience: 'certiflow-web', expiresIn: 600 } as const;

    const forged = jwt.sign(claims, 'not-the-real-secret-not-the-real-secret', { ...opts, algorithm: 'HS256' });
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 600;
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...claims, sub: farah.id, iss: 'certiflow', aud: 'certiflow-web', exp })}.`;
    const real = jwt.sign({ ...claims, role: 'CENTRE' }, getConfig().JWT_SECRET, { ...opts, algorithm: 'HS256' });
    const [h, , s] = real.split('.');
    const tampered = `${h}.${b64({ ...claims, sub: farah.id, iss: 'certiflow', aud: 'certiflow-web', exp })}.${s}`;
    const expired = jwt.sign(claims, getConfig().JWT_SECRET, { ...opts, algorithm: 'HS256', expiresIn: -10 });

    for (const token of [forged, unsigned, tampered, expired]) {
      const res = await request(testApp())
        .post(`/api/v1/batches/${b.id}/decisions`)
        .set('Cookie', `cf_session=${token}`)
        .set('If-Match', String(b.version))
        .send({ action: 'approve' });
      expect(res.status).toBe(401);
    }
    await request(testApp()).get('/api/v1/batches').expect(401);
    await unchanged(b.id, 'PENDING_STATE', b.version);
  });
});
