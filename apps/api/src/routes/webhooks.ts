// Delivery receipts from the WhatsApp provider. Authenticated by an HMAC-SHA256
// signature over the exact raw body, compared in constant time.
import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router } from 'express';
import { z } from 'zod';
import { Errors, getConfig, handleProviderWebhook } from '@certiflow/server';
import { rebindCorrelation } from '../middleware/correlation';

const webhookSchema = z
  .object({
    messageId: z.string().min(1).max(100),
    idempotencyKey: z.string().min(1).max(200),
    status: z.enum(['delivered', 'failed']),
    reason: z.string().max(300).optional(),
    timestamp: z.string().datetime(),
  })
  .strict();

const MAX_SKEW_MS = 5 * 60 * 1000;

export function signWebhookBody(rawBody: Buffer | string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function isValidSignature(rawBody: Buffer, header: string, secret: string): boolean {
  const expected = Buffer.from(signWebhookBody(rawBody, secret));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function webhooksRouter(): Router {
  const r = Router();
  r.post('/whatsapp', express.raw({ type: 'application/json', limit: '64kb' }), rebindCorrelation, async (req, res) => {
    const raw = req.body as unknown;
    if (!Buffer.isBuffer(raw)) throw Errors.badRequest('Expected a JSON body');
    if (!isValidSignature(raw, req.get('x-signature') ?? '', getConfig().WHATSAPP_WEBHOOK_SECRET)) {
      throw Errors.unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');
    }
    let json: unknown;
    try {
      json = JSON.parse(raw.toString('utf8'));
    } catch {
      throw Errors.badRequest('Malformed JSON');
    }
    const evt = webhookSchema.parse(json);
    // Signed but stale: refuse replays of old receipts.
    if (Math.abs(Date.now() - Date.parse(evt.timestamp)) > MAX_SKEW_MS) throw Errors.badRequest('Webhook timestamp too old');
    res.json({ ok: true, ...(await handleProviderWebhook(evt)) });
  });
  return r;
}
