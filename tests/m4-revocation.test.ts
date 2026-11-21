/**
 * Proves Moment 4 - revocation, and "Never - revoked shows genuine": verify -> VALID
 * (then served from cache) -> State revokes -> an immediate verify shows REVOKED, and
 * a slow reader holding a stale "VALID" can no longer overwrite the cache.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { cacheVerificationIfAbsent, handleEvent, prisma, redis } from '@certiflow/server';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeCertificate, testApp } from './helpers';

let refs: ReferenceData;
const verify = (n: string) => request(testApp()).get(`/api/v1/public/verify/${n}`);

describe('M4: revocation is visible immediately', () => {
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('VALID (cached) -> revoke -> REVOKED on the very next request', async () => {
    const { cert } = await makeCertificate(refs);
    const n = cert.certificateNumber;

    const first = await verify(n);
    expect(first.status).toBe(200);
    expect(first.body.result).toBe('VALID');
    expect(first.headers['x-cache']).toBe('MISS');

    const second = await verify(n);
    expect(second.body.result).toBe('VALID');
    expect(second.headers['x-cache']).toBe('HIT');

    const farah = await loginAs('farah');
    const revoke = await farah.post(`/api/v1/certificates/${n}/revoke`).send({ reason: 'Candidate did not attend the assessment' });
    expect(revoke.status).toBe(200);

    const third = await verify(n);
    expect(third.body.result).toBe('REVOKED');
    expect(third.body.certificate.revokedOn).toBeTruthy();

    // Database is the source of truth and agrees; the audit row and event exist.
    const row = await prisma.certificate.findUniqueOrThrow({ where: { certificateNumber: n } });
    expect(row.status).toBe('REVOKED');
    expect(await prisma.auditLog.count({ where: { action: 'CERTIFICATE_REVOKED', entityId: cert.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { type: 'CertificateRevoked' } })).toBe(1);
  });

  it('a stale VALID written by a slow reader after the revoke cannot win', async () => {
    const { cert } = await makeCertificate(refs);
    const n = cert.certificateNumber;
    const staleView = (await verify(n)).body; // VALID, captured "before" the revoke

    const farah = await loginAs('farah');
    await farah.post(`/api/v1/certificates/${n}/revoke`).send({ reason: 'Forged attendance sheet' }).expect(200);

    // The slow reader now tries to cache what it read earlier.
    await cacheVerificationIfAbsent(n, staleView);
    expect((await verify(n)).body.result).toBe('REVOKED');

    // Even with the cache wiped, the database answer is REVOKED.
    await redis().flushdb();
    const fromDb = await verify(n);
    expect(fromDb.headers['x-cache']).toBe('MISS');
    expect(fromDb.body.result).toBe('REVOKED');

    // The outbox handler re-asserts the REVOKED entry (covers an API crash after commit).
    await redis().flushdb();
    await handleEvent('CertificateRevoked', { certificateNumber: n });
    const cached = JSON.parse((await redis().get(`verify:v1:${n}`)) ?? '{}');
    expect(cached.result).toBe('REVOKED');
  });

  it('revoked certificates can no longer be downloaded, and revoking twice is a 409', async () => {
    const { cert, token } = await makeCertificate(refs);
    const farah = await loginAs('farah');
    await farah.post(`/api/v1/certificates/${cert.certificateNumber}/revoke`).send({ reason: 'Issued in error' }).expect(200);
    await farah.post(`/api/v1/certificates/${cert.certificateNumber}/revoke`).send({ reason: 'Issued in error' }).expect(409);
    await request(testApp()).get(`/api/v1/public/certificates/download/${token}`).expect(410);
  });

  it('only the State office can revoke', async () => {
    const { cert } = await makeCertificate(refs);
    for (const key of ['anika', 'dev', 'neha'] as const) {
      const agent = await loginAs(key);
      await agent.post(`/api/v1/certificates/${cert.certificateNumber}/revoke`).send({ reason: 'Trying my luck' }).expect(403);
    }
    expect((await verify(cert.certificateNumber)).body.result).toBe('VALID');
  });
});
