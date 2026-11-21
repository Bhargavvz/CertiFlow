// Domain events written to the transactional outbox and fanned out to BullMQ
// handlers and Socket.IO rooms.

export const EVENT_TYPES = [
  'BatchCreated',
  'BatchUpdated',
  'CandidatesImported',
  'BatchSubmitted',
  'BatchApproved',
  'BatchApprovalWithdrawn',
  'BatchSentBack',
  'BatchRejected',
  'BatchFinalApproved',
  'BatchIssuanceStarted',
  'BatchIssuanceCompleted',
  'BatchDeliveriesRetried',
  'CertificateIssued',
  'CertificateRevoked',
  'DeliverySucceeded',
  'DeliveryFailed',
  'SlaBreached',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Every event carries these so it can be routed to the right realtime rooms. */
export interface EventRouting {
  batchId: string;
  centreId: string;
  districtId: string;
}

/** What Socket.IO clients receive on the `certiflow:event` channel. */
export interface RealtimeMessage {
  type: EventType;
  payload: Record<string, unknown> & Partial<EventRouting>;
  at: string;
}

export const REALTIME_CHANNEL = 'certiflow:event';
