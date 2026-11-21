// Response shapes of the API, as the web app uses them.
import type { AuthUser, BatchStatus, Role, RowError } from '@certiflow/shared';

export type { AuthUser, BatchStatus, Role, RowError };

export type DeliveryStatusCode = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'DEAD';

export interface DemoUser {
  key: string;
  name: string;
  role: Role;
  centre: { name: string } | null;
  district: { name: string } | null;
}

export interface Meta {
  qualityThreshold: number;
  requiredDistrictApprovals: number;
  slaSeconds: number;
  maxImportRows: number;
  maxUploadBytes: number;
}

export interface Stats {
  batchesByStatus: Record<BatchStatus, number>;
  certificates: { issuedThisMonth: number; valid: number; revoked: number };
  candidatesInReview: number;
}

export interface StateOverview extends Stats {
  certificatesPerDay: { day: string; count: number }[];
  deliveryOutcomes: Record<DeliveryStatusCode, number>;
  avgStepSeconds: Record<'PENDING_DISTRICT' | 'PENDING_QUALITY' | 'PENDING_STATE', { avgSeconds: number | null; samples: number }>;
  slaBreached: number;
}

export interface BatchSummary {
  id: string;
  courseName: string;
  status: BatchStatus;
  revision: number;
  version: number;
  candidateCount: number;
  sendBackReason: string | null;
  submittedAt: string | null;
  currentStepEnteredAt: string | null;
  slaBreachedAt: string | null;
  createdAt: string;
  updatedAt: string;
  centreId: string;
  districtId: string;
  centre: { id: string; name: string };
  district: { id: string; name: string };
}

export interface CandidateRow {
  id: string;
  fullName: string;
  phone: string;
  enrolmentId: string;
  dob: string | null;
  score: number;
  passedOn: string;
  certificate: {
    certificateNumber: string;
    status: 'ISSUED' | 'REVOKED';
    issuedAt: string;
    revokedAt: string | null;
    revokeReason: string | null;
    deliveries: { status: DeliveryStatusCode; attempts: number; lastError: string | null; generation: number; updatedAt: string }[];
  } | null;
}

export interface ApprovalRow {
  id: string;
  revision: number;
  step: 'DISTRICT' | 'QUALITY' | 'STATE';
  decision: 'APPROVE' | 'REJECT' | 'SEND_BACK';
  reason: string | null;
  superseded: boolean;
  withdrawnAt: string | null;
  createdAt: string;
  officerId: string;
  officer: { name: string; role: Role };
}

export interface BatchDetail {
  batch: BatchSummary & { candidates: CandidateRow[]; approvals: ApprovalRow[] };
  districtApprovals: { required: number; count: number; officers: string[] };
  needsQualityReview: boolean;
  qualityThreshold: number;
  myActiveApproval: boolean;
  deliverySummary: { certificates: number; pending: number; sent: number; delivered: number; dead: number; retrying: number };
  allowed: {
    edit: boolean;
    submit: boolean;
    resubmit: boolean;
    approve: boolean;
    reject: boolean;
    sendBack: boolean;
    withdraw: boolean;
    revoke: boolean;
    retryDeliveries: boolean;
  };
}

export interface QueueItem extends BatchSummary {
  waitingSince: string;
  ageSeconds: number;
  slaDueAt: string | null;
  districtApprovals: number;
  approverNames: string[];
  iApproved: boolean;
}

export interface TimelineItem {
  at: string;
  kind: 'audit' | 'delivery_attempt';
  action: string;
  actorRole: string;
  actorName: string | null;
  entityType: string;
  entityId: string;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  correlationId: string | null;
}

export interface StuckItem {
  id: string;
  courseName: string;
  status: BatchStatus;
  candidateCount: number;
  revision: number;
  currentStepEnteredAt: string | null;
  slaBreachedAt: string | null;
  centre: { name: string };
  district: { name: string };
  ageSeconds: number;
  overdueSeconds: number;
  breached: boolean;
}

export interface StuckResponse {
  slaSeconds: number;
  slaSource: string;
  breached: StuckItem[];
  waiting: StuckItem[];
}

export interface CertificateSearchRow {
  certificateNumber: string;
  status: 'ISSUED' | 'REVOKED';
  issuedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  batchId: string;
  candidate: { fullName: string; enrolmentId: string };
  batch: { courseName: string; centre: { name: string } };
  deliveries: { status: DeliveryStatusCode; attempts: number }[];
}

export interface DeliveriesOverview {
  batches: {
    id: string;
    courseName: string;
    status: BatchStatus;
    candidateCount: number;
    updatedAt: string;
    centre: { name: string };
    certificates: number;
    counts: Record<DeliveryStatusCode, number>;
  }[];
  dead: {
    id: string;
    attempts: number;
    generation: number;
    lastError: string | null;
    updatedAt: string;
    certificateNumber: string;
    batchId: string;
    courseName: string;
    batchStatus: BatchStatus;
    centreName: string;
    candidateName: string;
    phone: string;
  }[];
}

export interface NotificationItem {
  id: string;
  at: string;
  action: string;
  batchId: string;
  courseName: string;
  actorName: string | null;
  actorRole: string;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  certificateNumber: string | null;
}

export interface PublicCertificate {
  certificateNumber: string;
  holderName: string;
  courseName: string;
  centreName: string;
  districtName: string;
  issuedOn: string;
  revokedOn: string | null;
}

export type VerifyResponse = { result: 'VALID' | 'REVOKED'; certificate: PublicCertificate } | { result: 'NOT_FOUND' };

export interface CandidateView {
  firstName: string;
  certificateNumber: string;
  status: 'VALID' | 'REVOKED';
  courseName: string;
  centreName: string;
  issuedOn: string;
  revokedOn: string | null;
  verifyUrl: string;
  downloadPath: string | null;
  qrDataUri: string;
}
