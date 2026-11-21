import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { BATCH_STATUSES, createBatchSchema, decisionSchema, submitSchema, updateBatchSchema, validateSpreadsheet } from '@certiflow/shared';
import {
  Errors,
  assertCanEdit,
  createBatch,
  decide,
  getBatchDetail,
  getConfig,
  getTimeline,
  importCandidates,
  listBatches,
  parseSpreadsheet,
  resubmitBatch,
  retryDeadDeliveries,
  submitBatch,
  updateBatch,
  withdrawApproval,
} from '@certiflow/server';
import { currentUser } from '../middleware/auth';
import { rebindCorrelation } from '../middleware/correlation';

/** Unknown/invalid ids are simply "not found" (no hint whether something exists). */
export function batchId(req: Request): string {
  const parsed = z.string().uuid().safeParse(req.params.id);
  if (!parsed.success) throw Errors.notFound('Batch not found');
  return parsed.data;
}

/** Version for optimistic locking: body "version" wins, else the If-Match header. */
function expectedVersion(req: Request, bodyVersion: number | undefined): number | undefined {
  if (bodyVersion !== undefined) return bodyVersion;
  const header = req.get('if-match');
  if (!header) return undefined;
  const n = Number(header.replace(/^W\//, '').replace(/"/g, ''));
  if (!Number.isInteger(n) || n < 0) throw Errors.badRequest('If-Match must be the batch version number');
  return n;
}

export function batchesRouter(): Router {
  const r = Router();
  const cfg = getConfig();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: cfg.MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    fileFilter: (_req, file, cb) => cb(null, /\.(csv|xlsx)$/i.test(file.originalname)),
  });

  const listQuery = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(BATCH_STATUSES).optional() }).strict();
  r.get('/', async (req, res) => {
    const { q, status } = listQuery.parse(req.query);
    res.json({ batches: await listBatches(currentUser(req), { q, status }) });
  });

  r.post('/', async (req, res) => {
    const body = createBatchSchema.parse(req.body);
    const batch = await createBatch(currentUser(req), body);
    res.status(201).json({ batch });
  });

  r.get('/:id', async (req, res) => {
    const detail = await getBatchDetail(currentUser(req), batchId(req));
    res.setHeader('ETag', `"${detail.batch.version}"`);
    res.json(detail);
  });

  r.patch('/:id', async (req, res) => {
    const body = updateBatchSchema.parse(req.body);
    res.json({ batch: await updateBatch(currentUser(req), batchId(req), body) });
  });

  // Moment 1: validate the whole file first; save all rows in one transaction or nothing.
  r.post(
    '/:id/candidates/import',
    async (req, _res, next) => {
      // Authorise BEFORE reading the file: outsiders learn nothing from validation output.
      await assertCanEdit(currentUser(req), batchId(req));
      next();
    },
    upload.single('file'),
    rebindCorrelation,
    async (req, res) => {
      const user = currentUser(req);
      const id = batchId(req);
      if (!req.file) throw Errors.badRequest('Attach a .csv or .xlsx file as the form field "file"');

      const sheet = await parseSpreadsheet(req.file.buffer, req.file.originalname);
      const result = validateSpreadsheet(sheet, cfg.MAX_IMPORT_ROWS);
      if (!result.ok) {
        throw Errors.unprocessable(
          'INVALID_SPREADSHEET',
          `${new Set(result.errors.map((e) => e.row)).size} row(s) have problems. Nothing was saved; fix them and upload again.`,
          { errors: result.errors, totalRows: result.totalRows },
        );
      }
      const batch = await importCandidates(user, id, result.candidates, req.file.originalname);
      res.json({ batch, imported: result.candidates.length });
    },
  );

  r.post('/:id/submit', async (req, res) => {
    const body = submitSchema.parse(req.body ?? {});
    res.json({ batch: await submitBatch(currentUser(req), batchId(req), expectedVersion(req, body.version)) });
  });

  r.post('/:id/resubmit', async (req, res) => {
    const body = submitSchema.parse(req.body ?? {});
    res.json({ batch: await resubmitBatch(currentUser(req), batchId(req), expectedVersion(req, body.version)) });
  });

  r.post('/:id/decisions', async (req, res) => {
    const body = decisionSchema.parse(req.body);
    const batch = await decide(currentUser(req), batchId(req), {
      action: body.action,
      reason: body.reason,
      version: expectedVersion(req, body.version),
    });
    res.json({ batch });
  });

  r.delete('/:id/approvals/mine', async (req, res) => {
    res.json({ batch: await withdrawApproval(currentUser(req), batchId(req)) });
  });

  r.get('/:id/timeline', async (req, res) => {
    res.json(await getTimeline(currentUser(req), batchId(req)));
  });

  r.post('/:id/deliveries/retry-dead', async (req, res) => {
    res.json(await retryDeadDeliveries(currentUser(req), batchId(req)));
  });

  return r;
}
