import type { Batch, BatchStatus } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { generateCertificateNumber } from '@certiflow/shared';
import { downloadTokenFor, prisma, redis, relayOutboxOnce, sha256Hex } from '@certiflow/server';
import { createApp } from '../apps/api/src/app';
import { demoCandidates, seedReferenceData, type DemoUserKey, type ReferenceData } from '../prisma/seed-data';

let app: Express | undefined;
export function testApp(): Express {
  if (!app) app = createApp();
  return app;
}

/** Wipe all data (TRUNCATE bypasses the append-only row trigger, which is intended). */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "DeliveryAttempt", "Delivery", "Certificate", "Approval", "Candidate", "Batch", "AuditLog", "OutboxEvent", "User", "TrainingCentre", "District" CASCADE',
  );
}

/** Fresh database + Redis with the demo users, centres and districts. */
export async function freshWorld(): Promise<ReferenceData> {
  await resetDb();
  await redis().flushdb();
  return seedReferenceData(prisma);
}

export async function loginAs(key: DemoUserKey) {
  const agent = request.agent(testApp());
  const res = await agent.post('/api/v1/auth/demo-login').send({ userKey: key });
  expect(res.status).toBe(200);
  return agent;
}

interface MakeBatchOptions {
  status?: BatchStatus;
  candidates?: number;
  centre?: 'NGP-001' | 'AMR-001';
  revision?: number;
  /** District officers who already approved the current revision. */
  districtApprovalsBy?: DemoUserKey[];
  stepEnteredAt?: Date;
  prefix?: string;
}

/** Insert a batch directly in a given state (bypassing the API) to set up a scenario. */
export async function makeBatch(refs: ReferenceData, opts: MakeBatchOptions = {}): Promise<Batch> {
  const centre = refs.centres[opts.centre ?? 'NGP-001']!;
  const status = opts.status ?? 'DRAFT';
  const revision = opts.revision ?? (status === 'DRAFT' ? 0 : 1);
  const count = opts.candidates ?? 5;
  const entered = opts.stepEnteredAt ?? new Date();
  const batch = await prisma.batch.create({
    data: {
      courseName: 'Test Course',
      centreId: centre.id,
      districtId: centre.districtId,
      createdById: (opts.centre === 'AMR-001' ? refs.users.ravi : refs.users.anika).id,
      status,
      revision,
      version: 3,
      candidateCount: count,
      submittedAt: status === 'DRAFT' ? null : entered,
      currentStepEnteredAt: status === 'DRAFT' ? null : entered,
      candidates: {
        create: demoCandidates(count, opts.prefix ?? `T${Math.floor(Math.random() * 1e6)}`, Math.floor(Math.random() * 900)),
      },
    },
  });
  for (const key of opts.districtApprovalsBy ?? []) {
    await prisma.approval.create({
      data: { batchId: batch.id, revision, step: 'DISTRICT', officerId: refs.users[key].id, decision: 'APPROVE' },
    });
  }
  return batch;
}

/** An issued certificate row (no PDF unless `withPdf`), for verify/revoke/download tests. */
export async function makeCertificate(refs: ReferenceData) {
  const batch = await makeBatch(refs, { status: 'ISSUED', candidates: 1 });
  const candidate = await prisma.candidate.findFirstOrThrow({ where: { batchId: batch.id } });
  const id = crypto.randomUUID();
  const token = downloadTokenFor(id);
  const cert = await prisma.certificate.create({
    data: {
      id,
      certificateNumber: generateCertificateNumber(2026),
      candidateId: candidate.id,
      batchId: batch.id,
      pdfKey: `certificates/${batch.id}/${id}.pdf`,
      pdfSha256: 'x',
      contentHash: 'x',
      downloadTokenHash: sha256Hex(token),
    },
  });
  return { batch, candidate, cert, token };
}

export async function drainOutbox(): Promise<void> {
  while ((await relayOutboxOnce()) > 0) {
    /* keep draining */
  }
}

export async function waitFor(check: () => Promise<boolean>, { timeoutMs = 10_000, intervalMs = 100, what = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
}

export function csv(rows: (string | number)[][]): Buffer {
  return Buffer.from(rows.map((r) => r.join(',')).join('\n'));
}
