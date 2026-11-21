// Sessions are signed JWTs in an httpOnly cookie. The API is stateless, so any
// instance can serve any request (needed for --scale api=2).
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ROLES, type AuthUser } from '@certiflow/shared';
import { getConfig } from '@certiflow/server';

export const SESSION_COOKIE = 'cf_session';
const ISSUER = 'certiflow';
const AUDIENCE = 'certiflow-web';

const claimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(ROLES),
  name: z.string(),
  centreId: z.string().uuid().nullable(),
  districtId: z.string().uuid().nullable(),
});

export function signSession(user: AuthUser): string {
  const cfg = getConfig();
  return jwt.sign(
    { role: user.role, name: user.name, centreId: user.centreId, districtId: user.districtId },
    cfg.JWT_SECRET,
    { algorithm: 'HS256', subject: user.id, expiresIn: cfg.JWT_TTL_SECONDS, issuer: ISSUER, audience: AUDIENCE },
  );
}

/** Throws on a missing, expired, tampered or wrongly-signed token. Pinning HS256 blocks "alg: none". */
export function verifySession(token: string): AuthUser {
  const decoded = jwt.verify(token, getConfig().JWT_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  const claims = claimsSchema.parse(decoded);
  return { id: claims.sub, role: claims.role, name: claims.name, centreId: claims.centreId, districtId: claims.districtId };
}

export function sessionCookieOptions() {
  const cfg = getConfig();
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: cfg.COOKIE_SECURE,
    path: '/',
    maxAge: cfg.JWT_TTL_SECONDS * 1000,
  };
}
