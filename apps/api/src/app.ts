import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { getConfig } from '@certiflow/server';
import { bullBoardRouter } from './admin';
import { authenticate, requireRole } from './middleware/auth';
import { correlation, rebindCorrelation, requestLogger } from './middleware/correlation';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { batchesRouter } from './routes/batches';
import { healthRouter } from './routes/health';
import { publicRouter } from './routes/public';
import { webhooksRouter } from './routes/webhooks';
import { certificatesRouter, queueRouter, stateRouter } from './routes/workflow';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp(): Express {
  const cfg = getConfig();
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx / a load balancer: trust one hop so req.ip is the real client (rate limiting).
  app.set('trust proxy', 1);

  app.use(correlation);
  app.use(requestLogger);
  app.use(cookieParser());

  app.use(healthRouter());

  // Bull Board serves its own HTML/JS, so it is mounted before helmet's strict CSP.
  app.use('/admin/queues', authenticate, requireRole('STATE'), bullBoardRouter('/admin/queues'));

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || cfg.CORS_ORIGINS.includes(origin)),
      credentials: true,
    }),
  );

  // Webhooks need the raw body for HMAC verification, so they go before express.json().
  app.use('/api/v1/webhooks', webhooksRouter());

  app.use(express.json({ limit: '100kb' }));
  app.use(rebindCorrelation);

  const v1 = express.Router();
  v1.use('/auth', authRouter());
  v1.use('/public', publicRouter());
  v1.use('/batches', authenticate, batchesRouter());
  v1.use('/queue', authenticate, queueRouter());
  v1.use('/state', authenticate, stateRouter());
  v1.use('/certificates', authenticate, certificatesRouter());
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
