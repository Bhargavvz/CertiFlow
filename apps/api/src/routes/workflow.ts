// Role-specific views: dashboard numbers, the work queue, notifications, the State
// office pages (overview, stuck, deliveries) and certificate search / revocation.
import { Router } from 'express';
import { z } from 'zod';
import { certificateSearchSchema, revokeSchema } from '@certiflow/shared';
import {
  Errors,
  getDeliveriesOverview,
  getMeta,
  getNotifications,
  getStateOverview,
  getStats,
  getStuckBatches,
  getWorkQueue,
  logger,
  openCertificatePdfForAdmin,
  retryDelivery,
  revokeCertificate,
  searchCertificates,
} from '@certiflow/server';
import { currentUser, requireRole } from '../middleware/auth';

/** GET /stats (role-scoped counts), GET /meta (thresholds the UI explains), GET /notifications. */
export function dashboardRouter(): Router {
  const r = Router();
  r.get('/stats', async (req, res) => {
    res.json(await getStats(currentUser(req)));
  });
  r.get('/meta', (_req, res) => {
    res.json(getMeta());
  });
  r.get('/notifications', async (req, res) => {
    res.json({ items: await getNotifications(currentUser(req)) });
  });
  return r;
}

export function queueRouter(): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    res.json({ items: await getWorkQueue(currentUser(req)) });
  });
  return r;
}

const deliveryId = z.string().uuid();

export function stateRouter(): Router {
  const r = Router();
  // Every route here is State-office only; the services check the policy again.
  r.use(requireRole('STATE'));
  r.get('/stuck', async (_req, res) => {
    res.json(await getStuckBatches());
  });
  r.get('/overview', async (req, res) => {
    res.json(await getStateOverview(currentUser(req)));
  });
  r.get('/deliveries', async (req, res) => {
    res.json(await getDeliveriesOverview(currentUser(req)));
  });
  r.post('/deliveries/:id/retry', async (req, res) => {
    const parsed = deliveryId.safeParse(req.params.id);
    if (!parsed.success) throw Errors.notFound('Delivery not found');
    res.json(await retryDelivery(currentUser(req), parsed.data));
  });
  return r;
}

export function certificatesRouter(): Router {
  const r = Router();
  r.get('/', async (req, res) => {
    const { q } = certificateSearchSchema.parse(req.query);
    res.json({ certificates: await searchCertificates(currentUser(req), q) });
  });
  r.get('/:number/pdf', async (req, res) => {
    const { stream, fileName } = await openCertificatePdfForAdmin(currentUser(req), String(req.params.number));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', (err) => {
      logger.error({ err: err.message }, 'admin pdf stream failed');
      res.destroy(err);
    });
    stream.pipe(res);
  });
  r.post('/:number/revoke', async (req, res) => {
    const { reason } = revokeSchema.parse(req.body);
    res.json(await revokeCertificate(currentUser(req), String(req.params.number), reason));
  });
  return r;
}
