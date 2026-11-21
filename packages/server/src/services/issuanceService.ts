// Moment 3: issuance. Every step is idempotent, so retries, duplicate events and
// worker crashes can never produce a second certificate for a candidate.
import { randomUUID } from 'node:crypto';
import { generateCertificateNumber, transition } from '@certiflow/shared';
import { SYSTEM_ACTOR, writeAudit } from '../audit';
import { isUniqueViolation, prisma } from '../db';
import { AppError } from '../errors';
import { logger } from '../logger';
import { addOutboxEvent } from '../outbox';
import { certificateContentHash, renderCertificatePdf, type CertificateContent } from '../pdf';
import { enqueueCertificateJobs } from '../queues';
import { putPdf } from '../storage';
import { downloadTokenFor, sha256Hex, verifyUrl } from '../tokens';
import { applyTransition } from './transitions';

const ISSUING_STATES = ['ISSUING', 'ISSUED', 'PARTIALLY_ISSUED'] as const;

function isVersionConflict(err: unknown) {
  return err instanceof AppError && err.code === 'VERSION_CONFLICT';
}

/** Handler for BatchFinalApproved: APPROVED -> ISSUING, then one job per candidate. */
export async function startIssuance(batchId: string): Promise<void> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch) return;

  if (batch.status === 'APPROVED') {
    try {
      await prisma.$transaction((tx) =>
        applyTransition(tx, batch, {
          to: transition(batch.status, 'start_issuing'),
          actor: SYSTEM_ACTOR,
          auditAction: 'ISSUANCE_STARTED',
          event: 'BatchIssuanceStarted',
          eventExtra: { candidateCount: batch.candidateCount },
        }),
      );
    } catch (err) {
      // Another worker handled the same event first; carry on and (re-)enqueue.
      if (!isVersionConflict(err)) throw err;
    }
  }

  const current = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
  if (!(ISSUING_STATES as readonly string[]).includes(current.status)) return;

  const candidates = await prisma.candidate.findMany({ where: { batchId }, select: { id: true } });
  // Deterministic job ids: enqueueing twice is a no-op in BullMQ.
  await enqueueCertificateJobs(batchId, candidates.map((c) => c.id));
}

export interface GenerateJobData {
  batchId: string;
  candidateId: string;
}

/**
 * Create the certificate + its delivery for one candidate.
 * Idempotency layers: (1) early exit if a certificate exists, (2) UNIQUE(candidateId)
 * in Postgres decides any race, (3) certificate number collisions are retried.
 */
export async function generateCertificate({ batchId, candidateId }: GenerateJobData): Promise<'created' | 'exists' | 'skipped'> {
  const existing = await prisma.certificate.findUnique({ where: { candidateId }, select: { id: true } });
  if (existing) return 'exists';

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: { batch: { include: { centre: { include: { district: true } } } } },
  });
  if (!candidate || candidate.batchId !== batchId) return 'skipped';
  const batch = candidate.batch;
  if (!(ISSUING_STATES as readonly string[]).includes(batch.status)) {
    logger.warn({ batchId, status: batch.status }, 'certificate job for a batch that is not issuing; skipping');
    return 'skipped';
  }

  const certificateId = randomUUID();
  const deliveryId = randomUUID();
  const issuedAt = new Date();
  const pdfKey = `certificates/${batchId}/${certificateId}.pdf`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const certificateNumber = generateCertificateNumber(issuedAt.getUTCFullYear());
    const content: CertificateContent = {
      certificateNumber,
      holderName: candidate.fullName,
      enrolmentId: candidate.enrolmentId,
      courseName: batch.courseName,
      centreName: batch.centre.name,
      districtName: batch.centre.district.name,
      score: candidate.score,
      passedOn: candidate.passedOn.toISOString().slice(0, 10),
      issuedOn: issuedAt.toISOString().slice(0, 10),
    };
    const contentHash = certificateContentHash(content);
    const pdf = await renderCertificatePdf(content, verifyUrl(certificateNumber), contentHash);
    // Upload before the DB insert: if we crash in between, the retry overwrites the
    // same key or finds the certificate row; at worst an orphan PDF, never a duplicate.
    await putPdf(pdfKey, pdf);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.certificate.create({
          data: {
            id: certificateId,
            certificateNumber,
            candidateId,
            batchId,
            pdfKey,
            pdfSha256: sha256Hex(pdf),
            contentHash,
            downloadTokenHash: sha256Hex(downloadTokenFor(certificateId)),
            issuedAt,
          },
        });
        await tx.delivery.create({
          data: { id: deliveryId, certificateId, idempotencyKey: `dlv-${deliveryId}-g1` },
        });
        await writeAudit(tx, {
          actor: SYSTEM_ACTOR,
          action: 'CERTIFICATE_ISSUED',
          entityType: 'CERTIFICATE',
          entityId: certificateId,
          batchId,
          toState: 'ISSUED',
          metadata: { certificateNumber, candidateId },
        });
        await addOutboxEvent(tx, 'CertificateIssued', {
          batchId,
          centreId: batch.centreId,
          districtId: batch.districtId,
          certificateId,
          certificateNumber,
          deliveryId,
          generation: 1,
        });
      });
      return 'created';
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Who won? If this candidate now has a certificate, another worker beat us: done.
      const winner = await prisma.certificate.findUnique({ where: { candidateId }, select: { id: true } });
      if (winner) return 'exists';
      // Otherwise it was a certificate-number collision (astronomically rare): new number.
      logger.warn({ attempt }, 'certificate number collision, retrying');
    }
  }
  throw new Error('Could not allocate a unique certificate number after 5 attempts');
}

/**
 * Called after every terminal delivery outcome. When every candidate has a
 * certificate and every delivery is DELIVERED or DEAD, close the batch.
 */
export async function maybeCompleteBatch(batchId: string): Promise<void> {
  const batch = await prisma.batch.findUnique({ where: { id: batchId } });
  if (!batch || (batch.status !== 'ISSUING' && batch.status !== 'PARTIALLY_ISSUED')) return;

  const [certificates, open, delivered] = await Promise.all([
    prisma.certificate.count({ where: { batchId } }),
    prisma.delivery.count({ where: { certificate: { batchId }, status: { in: ['PENDING', 'SENT', 'FAILED'] } } }),
    prisma.delivery.count({ where: { certificate: { batchId }, status: 'DELIVERED' } }),
  ]);
  if (certificates < batch.candidateCount || open > 0) return;

  const to = transition(batch.status, 'finish_issuing', { allDelivered: delivered === certificates });
  if (to === batch.status) return;
  try {
    await prisma.$transaction((tx) =>
      applyTransition(tx, batch, {
        to,
        actor: SYSTEM_ACTOR,
        auditAction: 'ISSUANCE_COMPLETED',
        event: 'BatchIssuanceCompleted',
        auditMetadata: { certificates, delivered, dead: certificates - delivered },
        eventExtra: { certificates, delivered, dead: certificates - delivered },
      }),
    );
  } catch (err) {
    if (!isVersionConflict(err)) throw err; // someone else completed it concurrently
  }
}
