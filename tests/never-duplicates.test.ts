/**
 * Proves "Never - duplicate certificates": a candidate can never have two
 * certificates and two certificates can never share a number. Enforced by database
 * constraints (not just application checks), plus idempotent generation under races.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateCertificateNumber } from '@certiflow/shared';
import { ensureBucket, generateCertificate, isUniqueViolation, prisma } from '@certiflow/server';
import type { ReferenceData } from '../prisma/seed-data';
import { freshWorld, makeBatch, makeCertificate } from './helpers';

let refs: ReferenceData;

const certData = (over: { candidateId: string; batchId: string; certificateNumber?: string; token?: string }) => ({
  certificateNumber: over.certificateNumber ?? generateCertificateNumber(2026),
  candidateId: over.candidateId,
  batchId: over.batchId,
  pdfKey: 'k',
  pdfSha256: 'x',
  contentHash: 'x',
  downloadTokenHash: over.token ?? crypto.randomUUID(),
});

describe('Never: duplicate certificates', () => {
  beforeAll(async () => {
    await ensureBucket();
  });
  beforeEach(async () => {
    refs = await freshWorld();
  });

  it('the database refuses a second certificate for the same candidate', async () => {
    const { cert, batch } = await makeCertificate(refs);
    const err = await prisma.certificate.create({ data: certData({ candidateId: cert.candidateId, batchId: batch.id }) }).catch((e) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('the database refuses two certificates with the same number', async () => {
    const { cert } = await makeCertificate(refs);
    const other = await makeBatch(refs, { status: 'ISSUED', candidates: 1 });
    const candidate = await prisma.candidate.findFirstOrThrow({ where: { batchId: other.id } });
    const err = await prisma.certificate
      .create({ data: certData({ candidateId: candidate.id, batchId: other.id, certificateNumber: cert.certificateNumber }) })
      .catch((e) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('a certificate has at most one WhatsApp delivery and idempotency keys are unique', async () => {
    const { cert } = await makeCertificate(refs);
    await prisma.delivery.create({ data: { certificateId: cert.id, idempotencyKey: 'k1' } });
    expect(isUniqueViolation(await prisma.delivery.create({ data: { certificateId: cert.id, idempotencyKey: 'k2' } }).catch((e) => e))).toBe(true);
  });

  it('the same officer cannot hold two live decisions on one revision (partial unique index)', async () => {
    const b = await makeBatch(refs, { status: 'PENDING_DISTRICT', districtApprovalsBy: ['dev'] });
    const dup = { batchId: b.id, revision: 1, step: 'DISTRICT' as const, officerId: refs.users.dev.id, decision: 'APPROVE' as const };
    expect(isUniqueViolation(await prisma.approval.create({ data: dup }).catch((e) => e))).toBe(true);
    // Superseded or withdrawn rows do not count, so history is kept without blocking.
    await prisma.approval.updateMany({ where: { batchId: b.id }, data: { superseded: true } });
    await expect(prisma.approval.create({ data: dup })).resolves.toBeTruthy();
  });

  it('racing certificate.generate jobs for the same candidate create exactly one certificate', async () => {
    const b = await makeBatch(refs, { status: 'ISSUING', candidates: 2 });
    const candidates = await prisma.candidate.findMany({ where: { batchId: b.id } });
    const results = await Promise.all(
      candidates.flatMap((c) => Array.from({ length: 4 }, () => generateCertificate({ batchId: b.id, candidateId: c.id }))),
    );
    expect(results.filter((r) => r === 'created')).toHaveLength(2);
    expect(await prisma.certificate.count({ where: { batchId: b.id } })).toBe(2);
    expect(await prisma.delivery.count({ where: { certificate: { batchId: b.id } } })).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { type: 'CertificateIssued' } })).toBe(2);
  });
});
