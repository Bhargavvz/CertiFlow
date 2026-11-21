// Dashboard numbers. Everything is computed from real rows, scoped with the same
// filter as the batch list, so a user can never count what they can't see.
import { BATCH_STATUSES, REQUIRED_DISTRICT_APPROVALS, type AuthUser, type BatchStatus } from '@certiflow/shared';
import { getConfig, slaMs } from '../config';
import { prisma } from '../db';
import { scopeFilter } from './batchService';

/** Start of the current calendar month in India (UTC+5:30), as a UTC instant. */
export function istMonthStart(now = new Date()): Date {
  const IST = 330 * 60_000;
  const local = new Date(now.getTime() + IST);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - IST);
}

export async function getStats(user: AuthUser) {
  const where = scopeFilter(user);
  const certWhere = { batch: where };

  const [byStatus, issuedThisMonth, valid, revoked, candidatesInReview] = await Promise.all([
    prisma.batch.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.certificate.count({ where: { ...certWhere, issuedAt: { gte: istMonthStart() } } }),
    prisma.certificate.count({ where: { ...certWhere, status: 'ISSUED' } }),
    prisma.certificate.count({ where: { ...certWhere, status: 'REVOKED' } }),
    prisma.batch.aggregate({
      where: { AND: [where, { status: { in: ['PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE'] } }] },
      _sum: { candidateCount: true },
    }),
  ]);

  const batchesByStatus = Object.fromEntries(BATCH_STATUSES.map((s) => [s, 0])) as Record<BatchStatus, number>;
  for (const row of byStatus) batchesByStatus[row.status] = row._count._all;

  return {
    batchesByStatus,
    certificates: { issuedThisMonth, valid, revoked },
    candidatesInReview: candidatesInReview._sum.candidateCount ?? 0,
  };
}

const REVIEW_STEPS = ['PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE'] as const;

/** Day key (YYYY-MM-DD) in India time. */
function istDay(d: Date): string {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/**
 * State office dashboard. Every figure is a query over real rows:
 * certificates per IST day (last 14), delivery outcomes, and how long batches
 * actually spent in each review step, measured from audit-log transitions.
 */
export async function getStateOverview(user: AuthUser, days = 14) {
  const stats = await getStats(user);
  const since = new Date(Date.now() - days * 86_400_000);

  const [perDayRows, deliveries, stepRows, breached] = await Promise.all([
    prisma.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT to_char(("issuedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, count(*) AS n
      FROM "Certificate"
      WHERE "issuedAt" >= ${since}
      GROUP BY 1`,
    prisma.delivery.groupBy({ by: ['status'], _count: { _all: true } }),
    // Each status change is one audit row. A step "lasts" from the row that entered it
    // until the batch's next status change (LEAD over that batch's transitions).
    prisma.$queryRaw<{ step: string; avg_seconds: number | null; samples: bigint }[]>`
      WITH t AS (
        SELECT "batchId", "toState", "createdAt",
               LEAD("createdAt") OVER (PARTITION BY "batchId" ORDER BY "createdAt") AS left_at
        FROM "AuditLog"
        WHERE "entityType" = 'BATCH' AND "batchId" IS NOT NULL AND "toState" IS NOT NULL
          AND "fromState" IS DISTINCT FROM "toState"
      )
      SELECT "toState" AS step, avg(extract(epoch FROM left_at - "createdAt"))::float8 AS avg_seconds, count(*) AS samples
      FROM t
      WHERE "toState" IN ('PENDING_DISTRICT', 'PENDING_QUALITY', 'PENDING_STATE') AND left_at IS NOT NULL
      GROUP BY "toState"`,
    prisma.batch.count({ where: { slaBreachedAt: { not: null }, status: { in: [...REVIEW_STEPS] } } }),
  ]);

  const counts = new Map(perDayRows.map((r) => [r.day, Number(r.n)]));
  const certificatesPerDay = Array.from({ length: days }, (_, i) => {
    const day = istDay(new Date(Date.now() - (days - 1 - i) * 86_400_000));
    return { day, count: counts.get(day) ?? 0 };
  });

  const deliveryOutcomes = { PENDING: 0, SENT: 0, DELIVERED: 0, FAILED: 0, DEAD: 0 };
  for (const d of deliveries) deliveryOutcomes[d.status] = d._count._all;

  const avgStepSeconds = Object.fromEntries(
    REVIEW_STEPS.map((s) => {
      const row = stepRows.find((r) => r.step === s);
      return [s, { avgSeconds: row?.avg_seconds ?? null, samples: Number(row?.samples ?? 0) }];
    }),
  ) as Record<(typeof REVIEW_STEPS)[number], { avgSeconds: number | null; samples: number }>;

  return { ...stats, certificatesPerDay, deliveryOutcomes, avgStepSeconds, slaBreached: breached };
}

/** Workflow settings the UI needs to explain itself (thresholds, limits). Not secret. */
export function getMeta() {
  const cfg = getConfig();
  return {
    qualityThreshold: cfg.QUALITY_THRESHOLD,
    requiredDistrictApprovals: REQUIRED_DISTRICT_APPROVALS,
    slaSeconds: Math.round(slaMs(cfg) / 1000),
    maxImportRows: cfg.MAX_IMPORT_ROWS,
    maxUploadBytes: cfg.MAX_UPLOAD_BYTES,
  };
}
