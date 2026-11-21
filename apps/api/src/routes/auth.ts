import { Router } from 'express';
import { demoLoginSchema, type AuthUser } from '@certiflow/shared';
import { Errors, getConfig, prisma, writeAudit } from '@certiflow/server';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '../auth/session';
import { authenticate, currentUser } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

export function authRouter(): Router {
  const r = Router();

  /** Users shown on the role switcher. Public, contains no secrets. */
  r.get('/demo-users', async (_req, res) => {
    if (!getConfig().DEMO_LOGIN_ENABLED) throw Errors.notFound();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { key: true, name: true, role: true, centre: { select: { name: true } }, district: { select: { name: true } } },
    });
    res.json({ users });
  });

  /**
   * One-click demo login. Still issues a real signed JWT: the client only says WHICH
   * demo user, the server looks up that user's role and scope from the database.
   */
  r.post('/demo-login', rateLimit('login', () => getConfig().RATE_LIMIT_LOGIN_PER_MIN), async (req, res) => {
    if (!getConfig().DEMO_LOGIN_ENABLED) throw Errors.notFound();
    const { userKey } = demoLoginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { key: userKey } });
    if (!user) throw Errors.unauthorized('Unknown demo user', 'UNKNOWN_USER');

    const authUser: AuthUser = { id: user.id, role: user.role, name: user.name, centreId: user.centreId, districtId: user.districtId };
    res.cookie(SESSION_COOKIE, signSession(authUser), sessionCookieOptions());
    await writeAudit(prisma, { actor: { id: user.id, role: user.role }, action: 'SIGNED_IN', entityType: 'USER', entityId: user.id, metadata: { method: 'demo-login' } });
    res.json({ user: authUser });
  });

  r.post('/logout', (_req, res) => {
    const { maxAge: _maxAge, ...opts } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    res.status(204).end();
  });

  r.get('/me', authenticate, (req, res) => {
    res.json({ user: currentUser(req) });
  });

  return r;
}
