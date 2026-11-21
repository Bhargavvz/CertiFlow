// No-login endpoints: certificate verification and token download. Rate-limited,
// and they only ever return the minimal public view.
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  Errors,
  checkHashAgainstCertificate,
  checkPdfAgainstCertificate,
  getCandidateView,
  getConfig,
  logger,
  openDownload,
  verifyCertificate,
} from '@certiflow/server';
import { rebindCorrelation } from '../middleware/correlation';
import { rateLimit } from '../middleware/rateLimit';

export function publicRouter(): Router {
  const r = Router();
  const verifyLimit = rateLimit('verify', () => getConfig().RATE_LIMIT_VERIFY_PER_MIN);
  const downloadLimit = rateLimit('download', () => getConfig().RATE_LIMIT_DOWNLOAD_PER_MIN);
  const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

  r.get('/verify/:number', verifyLimit, async (req, res) => {
    const { result, cache } = await verifyCertificate(String(req.params.number));
    res.setHeader('X-Cache', cache);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.result === 'NOT_FOUND' ? 404 : 200).json(result);
  });

  r.post('/verify/:number/check-pdf', verifyLimit, pdfUpload.single('file'), rebindCorrelation, async (req, res) => {
    if (!req.file) throw Errors.badRequest('Attach the PDF as the form field "file"');
    const outcome = await checkPdfAgainstCertificate(String(req.params.number), req.file.buffer);
    res.status(outcome.found ? 200 : 404).json(outcome);
  });

  // The browser hashes the PDF itself and sends only the hash (the file stays on the device).
  const hashSchema = z.object({ sha256: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Expected a SHA-256 hex digest') }).strict();
  r.post('/verify/:number/check-hash', verifyLimit, async (req, res) => {
    const { sha256 } = hashSchema.parse(req.body);
    const outcome = await checkHashAgainstCertificate(String(req.params.number), sha256);
    res.status(outcome.found ? 200 : 404).json(outcome);
  });

  // Data for the candidate's WhatsApp landing page (/c/:token in the web app).
  r.get('/certificates/:token', downloadLimit, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(await getCandidateView(String(req.params.token)));
  });

  r.get('/certificates/download/:token', downloadLimit, async (req, res) => {
    const { stream, fileName } = await openDownload(String(req.params.token));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', (err) => {
      logger.error({ err: err.message }, 'pdf stream failed');
      res.destroy(err);
    });
    stream.pipe(res);
  });

  return r;
}
