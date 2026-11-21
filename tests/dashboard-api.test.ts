/**
 * New UI endpoints (phase 2): GET /stats is scoped exactly like the batch list
 * ("Never - data leak": a user can't count what they can't see), and GET /meta
 * returns the workflow settings the UI explains. Both require a session.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateCertificateNumber } from '@certiflow/shared';
import { istMonthStart, prisma } from '@certiflow/server';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, loginAs, makeBatch, testApp } from './helpers';

let refs: ReferenceData;

async function issueCertificates(batchId: string, revokeFirst = false) {
  const candidates = await prisma.candidate.findMany({ where: { batchId } });
  for (const [i, c] of candidates.entries()) {
    const revoked = revokeFirst && i === 0;
    await prisma.certificate.create({
      data: {
        certificateNumber: generateCertificateNumber(2026),
        candidateId: c.id,
        batchId,
        pdfKey: 'k',
        pdfSha256: 'x',
        contentHash: 'x',
        downloadTokenHash: crypto.randomUUID(),
        status: revoked ? 'REVOKED' : 'ISSUED',
        revokedAt: revoked ? new Date() : null,
      },
    });
  }
}

describe('GET /stats and GET /meta', () => {
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('counts only the caller’s own centre for a training centre', async () => {
    await makeBatch(refs, { status: 'DRAFT' });
    await makeBatch(refs, { status: 'SENT_BACK' });
    await makeBatch(refs, { status: 'PENDING_DISTRICT', candidates: 7 });
    const issued = await makeBatch(refs, { status: 'ISSUED', candidates: 4 });
    await issueCertificates(issued.id, true);
    // Another centre's activity must not leak into Anika's numbers.
    const other = await makeBatch(refs, { status: 'ISSUED', candidates: 3, centre: 'AMR-001' });
    await issueCertificates(other.id);

    const res = await (await loginAs('anika')).get('/api/v1/stats').expect(200);
    expect(res.body.batchesByStatus).toMatchObject({ DRAFT: 1, SENT_BACK: 1, PENDING_DISTRICT: 1, ISSUED: 1 });
    expect(res.body.certificates).toEqual({ issuedThisMonth: 4, valid: 3, revoked: 1 });
    expect(res.body.candidatesInReview).toBe(7);
  });

  it('never counts drafts for officers, and keeps districts apart', async () => {
    await makeBatch(refs, { status: 'DRAFT' });
    await makeBatch(refs, { status: 'PENDING_DISTRICT' });
    await makeBatch(refs, { status: 'PENDING_DISTRICT', centre: 'AMR-001' });

    const dev = await (await loginAs('dev')).get('/api/v1/stats').expect(200);
    expect(dev.body.batchesByStatus.DRAFT).toBe(0);
    expect(dev.body.batchesByStatus.PENDING_DISTRICT).toBe(1);

    const farah = await (await loginAs('farah')).get('/api/v1/stats').expect(200);
    expect(farah.body.batchesByStatus.PENDING_DISTRICT).toBe(2);
    expect(farah.body.batchesByStatus.DRAFT).toBe(0);
  });

  it('returns workflow settings', async () => {
    const res = await (await loginAs('neha')).get('/api/v1/meta').expect(200);
    expect(res.body).toMatchObject({ qualityThreshold: 50, requiredDistrictApprovals: 2, maxImportRows: 1000 });
    expect(res.body.slaSeconds).toBeGreaterThan(0);
  });

  it('requires a session', async () => {
    await request(testApp()).get('/api/v1/stats').expect(401);
    await request(testApp()).get('/api/v1/meta').expect(401);
  });

  it('computes the start of the month in India time', () => {
    // 31 Oct 2026 20:00 UTC is already 1 Nov 01:30 in India.
    expect(istMonthStart(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(istMonthStart(new Date('2026-11-15T10:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
  });
});
