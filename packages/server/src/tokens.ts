import { createHash, createHmac } from 'node:crypto';
import { getConfig } from './config';

/**
 * Download token = HMAC-SHA256(secret, certificateId), 256 bits, base64url (43 chars).
 * Unguessable without the server secret, and re-derivable by any worker, so a
 * retried WhatsApp job can rebuild the link while the database only stores a hash.
 */
export function downloadTokenFor(certificateId: string): string {
  return createHmac('sha256', getConfig().DOWNLOAD_TOKEN_SECRET).update(`download:${certificateId}`).digest('base64url');
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export const DOWNLOAD_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** The friendly landing page a candidate opens from WhatsApp (it offers the PDF download). */
export function candidatePageUrl(token: string): string {
  return `${getConfig().PUBLIC_WEB_URL}/c/${token}`;
}

export function downloadUrl(token: string): string {
  return `${getConfig().PUBLIC_WEB_URL}/api/v1/public/certificates/download/${token}`;
}

export function verifyUrl(certificateNumber: string): string {
  return `${getConfig().PUBLIC_WEB_URL}/verify/${certificateNumber}`;
}
