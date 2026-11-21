// Role-specific views: the queue ("waiting for me"), the State stuck dashboard and
// certificate search / revocation.
import { Router } from 'express';
import { certificateSearchSchema, revokeSchema } from '@certiflow/shared';
import { getStuckBatches, getWorkQueue, revokeCertificate, searchCertificates } from '@certiflow/server';
import { currentUser, requireRole } from '../middleware/auth';

export function queueRouter(): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    res.json({ items: await getWorkQueue(currentUser(req)) });
  });
  return r;
}

export function stateRouter(): Router {
  const r = Router();
  r.get('/stuck', requireRole('STATE'), async (_req, res) => {
    res.json(await getStuckBatches());
  });
  return r;
}

export function certificatesRouter(): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    const { q } = certificateSearchSchema.parse(req.query);
    res.json({ certificates: await searchCertificates(currentUser(req), q) });
  });
  r.post('/:number/revoke', async (req, res) => {
    const { reason } = revokeSchema.parse(req.body);
    res.json(await revokeCertificate(currentUser(req), String(req.params.number), reason));
  });
  return r;
}
