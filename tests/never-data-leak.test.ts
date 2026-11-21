/**
 * Proves "Never - data leak": strangers cannot fetch someone's certificate or personal
 * data. Public verify returns only masked name, course, centre, dates, status; download
 * needs an unguessable token; verify is rate-limited; webhooks must be HMAC-signed.
 */
import { createHmac, randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureBucket, getConfig, putPdf } from '@certiflow/server';
import { rateLimit } from '../apps/api/src/middleware/rateLimit';
import { errorHandler } from '../apps/api/src/middleware/errorHandler';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch, makeCertificate, testApp } from './helpers';

let refs: ReferenceData;

describe('Never: data leak', () => {
  beforeAll(async () => {
    await ensureBucket();
  });
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('public verify exposes only the whitelisted, masked fields', async () => {
    const { cert, candidate } = await makeCertificate(refs);
    const res = await request(testApp()).get(`/api/v1/public/verify/${cert.certificateNumber}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['certificate', 'result']);
    expect(Object.keys(res.body.certificate).sort()).toEqual(
      ['centreName', 'certificateNumber', 'courseName', 'districtName', 'holderName', 'issuedOn', 'revokedOn'].sort(),
    );
    expect(res.body.certificate.holderName).toMatch(/^(\p{Lu}\*{4} ?)+$/u);

    const raw = JSON.stringify(res.body);
    for (const secret of [candidate.phone, candidate.phone.slice(-10), candidate.enrolmentId, candidate.fullName, candidate.id, cert.id, cert.batchId]) {
      expect(raw).not.toContain(secret);
    }
  });

  it('unknown or malformed numbers are NOT_FOUND without hinting at anything', async () => {
    const { cert } = await makeCertificate(refs);
    const wrongCheck = cert.certificateNumber.slice(0, -1) + (cert.certificateNumber.endsWith('0') ? '1' : '0');
    for (const n of [wrongCheck, 'PSM-2026-AAAAAAAAAAA', 'nonsense', '1']) {
      const res = await request(testApp()).get(`/api/v1/public/verify/${n}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ result: 'NOT_FOUND' });
    }
  });

  it('download works only with the exact unguessable token', async () => {
    const { cert, token } = await makeCertificate(refs);
    await putPdf(cert.pdfKey, Buffer.from('%PDF-1.4 test'));
    const ok = await request(testApp()).get(`/api/v1/public/certificates/download/${token}`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('application/pdf');

    const random = randomBytes(32).toString('base64url');
    await request(testApp()).get(`/api/v1/public/certificates/download/${random}`).expect(404);
    await request(testApp()).get(`/api/v1/public/certificates/download/${cert.id}`).expect(404);
    const oneCharOff = token.slice(0, -1) + (token.endsWith('x') ? 'y' : 'x');
    await request(testApp()).get(`/api/v1/public/certificates/download/${oneCharOff}`).expect(404);
    expect(token).toHaveLength(43); // 256-bit token
  });

  it('a centre cannot read another centre batch, its candidates or its timeline', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_DISTRICT', centre: 'AMR-001' });
    const anika = await loginAs('anika');
    await anika.get(`/api/v1/batches/${b.id}`).expect(404);
    await anika.get(`/api/v1/batches/${b.id}/timeline`).expect(404);
    const dev = await loginAs('dev'); // Nagpur officer, batch is in Amravati
    await dev.get(`/api/v1/batches/${b.id}`).expect(404);
    await request(testApp()).get(`/api/v1/batches/${b.id}`).expect(401);
  });

  it('verify is rate limited per client', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.get('/v', rateLimit(`test-${Date.now()}`, () => 3), (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(app).get('/v')).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it('webhooks without a valid HMAC signature are rejected', async () => {
    const body = JSON.stringify({ messageId: 'wamid.x', idempotencyKey: 'dlv-unknown-g1', status: 'delivered', timestamp: new Date().toISOString() });
    const post = (sig: string) =>
      request(testApp()).post('/api/v1/webhooks/whatsapp').set('content-type', 'application/json').set('x-signature', sig).send(body);

    expect((await post('sha256=deadbeef')).status).toBe(401);
    expect((await post('')).status).toBe(401);
    const wrongKey = `sha256=${createHmac('sha256', 'attacker-secret').update(body).digest('hex')}`;
    expect((await post(wrongKey)).status).toBe(401);
    const good = `sha256=${createHmac('sha256', getConfig().WHATSAPP_WEBHOOK_SECRET).update(body).digest('hex')}`;
    const res = await post(good);
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('ignored_unknown_or_old_key');
  });
});
