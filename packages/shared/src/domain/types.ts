// Plain string unions that mirror the Prisma enums, so the web app can use them
// without depending on @prisma/client.

export const ROLES = ['CENTRE', 'DISTRICT_OFFICER', 'QUALITY', 'STATE'] as const;
export type Role = (typeof ROLES)[number];

export const BATCH_STATUSES = [
  'DRAFT',
  'PENDING_DISTRICT',
  'PENDING_QUALITY',
  'PENDING_STATE',
  'SENT_BACK',
  'REJECTED',
  'APPROVED',
  'ISSUING',
  'ISSUED',
  'PARTIALLY_ISSUED',
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export type ReviewStep = 'DISTRICT' | 'QUALITY' | 'STATE';

/** The authenticated user, built only from a verified JWT, never from a request body. */
export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  centreId: string | null;
  districtId: string | null;
}

export const ROLE_LABELS: Record<Role, string> = {
  CENTRE: 'Training centre',
  DISTRICT_OFFICER: 'District officer',
  QUALITY: 'Quality',
  STATE: 'State office',
};

export const STATUS_LABELS: Record<BatchStatus, string> = {
  DRAFT: 'Draft',
  PENDING_DISTRICT: 'Waiting for district',
  PENDING_QUALITY: 'Waiting for quality',
  PENDING_STATE: 'Waiting for state',
  SENT_BACK: 'Sent back',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
  ISSUING: 'Issuing',
  ISSUED: 'Issued',
  PARTIALLY_ISSUED: 'Partially issued',
};
