// Public verification, revocation, search and token-based download.
import type { Readable } from 'node:stream';
import QRCode from 'qrcode';
import { can, isValidCertificateNumber, maskName, normaliseCertificateNumber, type AuthUser } from '@certiflow/shared';
import { PUBLIC_ACTOR, actorOf, writeAudit } from '../audit';
import { prisma } from '../db';
import { Errors, assertAllowed } from '../errors';
import { logger } from '../logger';
import { addOutboxEvent } from '../outbox';
import { getPdfStream } from '../storage';
import { DOWNLOAD_TOKEN_RE, sha256Hex, verifyUrl } from '../tokens';
import {
  cacheVerificationIfAbsent,
  getCachedVerification,
  writeRevokedVerification,
  type PublicCertificateView,
  type VerifyResult,
} from '../verifyCache';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Reads the truth from Postgres and maps it to the minimal public view. */
export async function loadPublicView(certificateNumber: string): Promise<VerifyResult> {
  const cert = await prisma.certificate.findUnique({
    where: { certificateNumber },
    select: {
      certificateNumber: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      candidate: { select: { fullName: true } },
      batch: { select: { courseName: true, centre: { select: { name: true, district: { select: { name: true } } } } } },
    },
  });
  if (!cert) return { result: 'NOT_FOUND' };
  // Whitelist of fields: no phone, no enrolment id, no internal ids.
  const view: PublicCertificateView = {
    certificateNumber: cert.certificateNumber,
    holderName: maskName(cert.candidate.fullName),
    courseName: cert.batch.courseName,
    centreName: cert.batch.centre.name,
    districtName: cert.batch.centre.district.name,
    issuedOn: isoDate(cert.issuedAt),
    revokedOn: cert.revokedAt ? isoDate(cert.revokedAt) : null,
  };
  return cert.status === 'REVOKED' ? { result: 'REVOKED', certificate: view } : { result: 'VALID', certificate: view };
}

export async function verifyCertificate(raw: string): Promise<{ result: VerifyResult; cache: 'HIT' | 'MISS' | 'SKIP' }> {
  const number = normaliseCertificateNumber(raw);
  // Malformed numbers or a wrong check character never touch Redis or Postgres.
  if (!isValidCertificateNumber(number)) return { result: { result: 'NOT_FOUND' }, cache: 'SKIP' };

  const cached = await getCachedVerification(number);
  if (cached) return { result: cached, cache: 'HIT' };

  const result = await loadPublicView(number);
  await cacheVerificationIfAbsent(number, result);
  return { result, cache: 'MISS' };
}

export async function revokeCertificate(user: AuthUser, rawNumber: string, reason: string) {
  assertAllowed(can(user, 'certificate.revoke'));
  const number = normaliseCertificateNumber(rawNumber);

  const revoked = await prisma.$transaction(async (tx) => {
    const cert = await tx.certificate.findUnique({ where: { certificateNumber: number }, include: { batch: true } });
    if (!cert) throw Errors.notFound('Certificate not found');
    if (cert.status === 'REVOKED') throw Errors.conflict('ALREADY_REVOKED', 'This certificate is already revoked');

    const now = new Date();
    const updated = await tx.certificate.updateMany({
      where: { id: cert.id, status: 'ISSUED' },
      data: { status: 'REVOKED', revokedAt: now, revokedById: user.id, revokeReason: reason },
    });
    if (updated.count !== 1) throw Errors.conflict('ALREADY_REVOKED', 'This certificate was revoked a moment ago');

    await writeAudit(tx, {
      actor: actorOf(user),
      action: 'CERTIFICATE_REVOKED',
      entityType: 'CERTIFICATE',
      entityId: cert.id,
      batchId: cert.batchId,
      fromState: 'ISSUED',
      toState: 'REVOKED',
      reason,
      metadata: { certificateNumber: cert.certificateNumber },
    });
    await addOutboxEvent(tx, 'CertificateRevoked', {
      certificateId: cert.id,
      certificateNumber: cert.certificateNumber,
      batchId: cert.batchId,
      centreId: cert.batch.centreId,
      districtId: cert.batch.districtId,
      reason,
    });
    return { certificateNumber: cert.certificateNumber, revokedAt: now };
  });

  // Write-through right after commit. The outbox handler does it again, which covers
  // the case where this process dies between the commit and this line.
  await refreshRevokedCache(revoked.certificateNumber);
  return revoked;
}

export async function refreshRevokedCache(certificateNumber: string): Promise<void> {
  try {
    const view = await loadPublicView(certificateNumber);
    if (view.result === 'REVOKED') await writeRevokedVerification(view.certificate);
  } catch (err) {
    logger.error({ err: (err as Error).message, certificateNumber }, 'failed to write revoked verify cache');
  }
}

export async function searchCertificates(user: AuthUser, q: string | undefined) {
  assertAllowed(can(user, 'certificate.search'));
  const term = (q ?? '').trim();
  return prisma.certificate.findMany({
    where: term
      ? {
          OR: [
            { certificateNumber: { contains: term.toUpperCase() } },
            { candidate: { fullName: { contains: term, mode: 'insensitive' } } },
          ],
        }
      : {},
    orderBy: { issuedAt: 'desc' },
    take: 50,
    select: {
      certificateNumber: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      revokeReason: true,
      batchId: true,
      candidate: { select: { fullName: true, enrolmentId: true } },
      batch: { select: { courseName: true, centre: { select: { name: true } } } },
      deliveries: { select: { status: true, attempts: true } },
    },
  });
}

export async function openDownload(token: string): Promise<{ stream: Readable; fileName: string }> {
  if (!DOWNLOAD_TOKEN_RE.test(token)) throw Errors.notFound('Certificate not found');
  const cert = await prisma.certificate.findUnique({ where: { downloadTokenHash: sha256Hex(token) } });
  if (!cert) throw Errors.notFound('Certificate not found');
  if (cert.status === 'REVOKED') throw Errors.gone('This certificate has been revoked and can no longer be downloaded');

  const stream = await getPdfStream(cert.pdfKey);
  await writeAudit(prisma, {
    actor: PUBLIC_ACTOR,
    action: 'CERTIFICATE_DOWNLOADED',
    entityType: 'CERTIFICATE',
    entityId: cert.id,
    batchId: cert.batchId,
  });
  return { stream, fileName: `${cert.certificateNumber}.pdf` };
}

/** Optional bonus: does an uploaded PDF match the one we issued byte for byte? */
export async function checkPdfAgainstCertificate(rawNumber: string, pdf: Buffer) {
  const number = normaliseCertificateNumber(rawNumber);
  if (!isValidCertificateNumber(number)) return { found: false as const };
  const cert = await prisma.certificate.findUnique({ where: { certificateNumber: number }, select: { pdfSha256: true, status: true } });
  if (!cert) return { found: false as const };
  return { found: true as const, matches: sha256Hex(pdf) === cert.pdfSha256, status: cert.status };
}

/** State office: open any certificate's PDF (audited, unlike the public token route it needs no token). */
export async function openCertificatePdfForAdmin(user: AuthUser, rawNumber: string): Promise<{ stream: Readable; fileName: string }> {
  assertAllowed(can(user, 'certificate.search'));
  const number = normaliseCertificateNumber(rawNumber);
  const cert = await prisma.certificate.findUnique({ where: { certificateNumber: number } });
  if (!cert) throw Errors.notFound('Certificate not found');
  const stream = await getPdfStream(cert.pdfKey);
  await writeAudit(prisma, {
    actor: actorOf(user),
    action: 'CERTIFICATE_DOWNLOADED_ADMIN',
    entityType: 'CERTIFICATE',
    entityId: cert.id,
    batchId: cert.batchId,
    metadata: { certificateNumber: cert.certificateNumber },
  });
  return { stream, fileName: `${cert.certificateNumber}.pdf` };
}

/**
 * What the candidate's WhatsApp link page shows. The token is the only key, and the
 * page deliberately shows only a first name plus course, centre and date.
 */
export async function getCandidateView(token: string) {
  if (!DOWNLOAD_TOKEN_RE.test(token)) throw Errors.notFound('This link is not valid');
  const cert = await prisma.certificate.findUnique({
    where: { downloadTokenHash: sha256Hex(token) },
    select: {
      certificateNumber: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      candidate: { select: { fullName: true } },
      batch: { select: { courseName: true, centre: { select: { name: true } } } },
    },
  });
  if (!cert) throw Errors.notFound('This link is not valid');
  const verify = verifyUrl(cert.certificateNumber);
  const qrSvg = await QRCode.toString(verify, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return {
    firstName: cert.candidate.fullName.trim().split(/\s+/)[0] ?? '',
    certificateNumber: cert.certificateNumber,
    status: cert.status === 'REVOKED' ? ('REVOKED' as const) : ('VALID' as const),
    courseName: cert.batch.courseName,
    centreName: cert.batch.centre.name,
    issuedOn: isoDate(cert.issuedAt),
    revokedOn: cert.revokedAt ? isoDate(cert.revokedAt) : null,
    verifyUrl: verify,
    downloadPath: cert.status === 'REVOKED' ? null : `/api/v1/public/certificates/download/${token}`,
    qrDataUri: `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString('base64')}`,
  };
}

/**
 * "Check a PDF": the browser hashes the file locally and sends only the SHA-256,
 * so the document itself never leaves the person's device.
 */
export async function checkHashAgainstCertificate(rawNumber: string, sha256: string) {
  const number = normaliseCertificateNumber(rawNumber);
  if (!isValidCertificateNumber(number)) return { found: false as const };
  const cert = await prisma.certificate.findUnique({ where: { certificateNumber: number }, select: { pdfSha256: true, status: true } });
  if (!cert) return { found: false as const };
  return { found: true as const, matches: sha256.toLowerCase() === cert.pdfSha256, status: cert.status === 'REVOKED' ? 'REVOKED' : 'VALID' };
}
