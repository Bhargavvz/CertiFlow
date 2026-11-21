// Redis cache for public verification (Moment 4 / "Revoked shows genuine" never).
//
// Rules that make a stale "VALID" impossible to serve after a revoke:
//  1. Readers only ever write with SET ... NX (never overwrite an existing entry).
//  2. Revocation writes the REVOKED entry with a plain SET (always overwrites),
//     right after its DB transaction commits, and again from the outbox handler.
//  3. Revocation is permanent, so a REVOKED entry is never wrong.
// A reader that loaded "VALID" from the DB just before the revoke committed can no
// longer overwrite the REVOKED entry (NX fails), and if it wrote first, the revoke
// overwrites it. Redis errors fall back to the database (the source of truth).
import { getConfig } from './config';
import { logger } from './logger';
import { redis } from './redis';

export interface PublicCertificateView {
  certificateNumber: string;
  holderName: string; // masked, e.g. "A**** S****"
  courseName: string;
  centreName: string;
  districtName: string;
  issuedOn: string; // YYYY-MM-DD
  revokedOn: string | null;
}

export type VerifyResult =
  | { result: 'VALID'; certificate: PublicCertificateView }
  | { result: 'REVOKED'; certificate: PublicCertificateView }
  | { result: 'NOT_FOUND' };

const NOT_FOUND_TTL_SECONDS = 30;
const key = (certificateNumber: string) => `verify:v1:${certificateNumber}`;

export async function getCachedVerification(certificateNumber: string): Promise<VerifyResult | null> {
  try {
    const raw = await redis().get(key(certificateNumber));
    return raw ? (JSON.parse(raw) as VerifyResult) : null;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'verify cache read failed; using database');
    return null;
  }
}

/** Reader path: only fills an empty slot. */
export async function cacheVerificationIfAbsent(certificateNumber: string, value: VerifyResult): Promise<void> {
  const ttl = value.result === 'NOT_FOUND' ? NOT_FOUND_TTL_SECONDS : getConfig().VERIFY_CACHE_TTL_SECONDS;
  try {
    await redis().set(key(certificateNumber), JSON.stringify(value), 'EX', ttl, 'NX');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'verify cache write failed');
  }
}

/** Revocation path: always overwrites. */
export async function writeRevokedVerification(view: PublicCertificateView): Promise<void> {
  const value: VerifyResult = { result: 'REVOKED', certificate: view };
  await redis().set(key(view.certificateNumber), JSON.stringify(value), 'EX', getConfig().VERIFY_CACHE_TTL_SECONDS);
}
