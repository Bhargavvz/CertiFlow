import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@certiflow/shared';
import { currentCorrelationId } from './context';
import type { Tx } from './db';

export interface Actor {
  id: string | null;
  role: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, role: 'SYSTEM' };
export const PUBLIC_ACTOR: Actor = { id: null, role: 'PUBLIC' };
export const PROVIDER_ACTOR: Actor = { id: null, role: 'WHATSAPP_PROVIDER' };

export function actorOf(user: AuthUser): Actor {
  return { id: user.id, role: user.role };
}

export interface AuditEntry {
  actor: Actor;
  action: string;
  entityType: 'BATCH' | 'CERTIFICATE' | 'DELIVERY' | 'USER';
  entityId: string;
  batchId?: string | null;
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append one audit row. Callers pass the SAME transaction client that makes the
 * change, so the change and its audit record commit or roll back together.
 */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actor.id,
      actorRole: entry.actor.role,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      batchId: entry.batchId ?? (entry.entityType === 'BATCH' ? entry.entityId : null),
      fromState: entry.fromState ?? null,
      toState: entry.toState ?? null,
      reason: entry.reason ?? null,
      metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      correlationId: currentCorrelationId(),
    },
  });
}
