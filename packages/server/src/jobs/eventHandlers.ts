// Side effects of domain events, run by the worker from the `outbox.events` queue.
// Each handler is idempotent: an event may be delivered more than once.
import { isReviewState, type EventType } from '@certiflow/shared';
import { slaMs } from '../config';
import { logger } from '../logger';
import { enqueueWhatsappSend, scheduleSlaCheck } from '../queues';
import { refreshRevokedCache } from '../services/certificateService';
import { maybeCompleteBatch, startIssuance } from '../services/issuanceService';

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export async function handleEvent(type: EventType, payload: Payload): Promise<void> {
  // Any transition INTO a review step starts that step's SLA clock.
  const toState = str(payload.toState);
  const stepEnteredAt = str(payload.stepEnteredAt);
  if (payload.stepChanged === true && toState && isReviewState(toState) && stepEnteredAt) {
    await scheduleSlaCheck({ batchId: String(payload.batchId), status: toState, stepEnteredAt }, slaMs());
  }

  switch (type) {
    case 'BatchFinalApproved':
      await startIssuance(String(payload.batchId));
      break;

    case 'CertificateIssued':
      await enqueueWhatsappSend(String(payload.deliveryId), Number(payload.generation ?? 1));
      break;

    case 'DeliveryFailed':
      if (payload.retry === true) {
        await enqueueWhatsappSend(String(payload.deliveryId), Number(payload.generation));
      } else {
        await maybeCompleteBatch(String(payload.batchId));
      }
      break;

    case 'DeliverySucceeded':
      await maybeCompleteBatch(String(payload.batchId));
      break;

    case 'CertificateRevoked':
      // Second write of the REVOKED cache entry (the API wrote it right after commit).
      await refreshRevokedCache(String(payload.certificateNumber));
      break;

    case 'SlaBreached':
      // The realtime push to the State office already happened in the relay.
      logger.warn({ batchId: payload.batchId, status: payload.status }, 'SLA breached; State office notified');
      break;

    default:
      break;
  }
}
