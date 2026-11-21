// Certificate PDFs live in a private S3-compatible bucket (MinIO locally). Nothing is
// public: downloads are streamed through the API after a token check.
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { getConfig } from './config';
import { logger } from './logger';

let client: S3Client | undefined;

function s3(): S3Client {
  if (!client) {
    const cfg = getConfig();
    client = new S3Client({
      endpoint: cfg.S3_ENDPOINT,
      region: cfg.S3_REGION,
      forcePathStyle: true, // MinIO uses path-style URLs
      credentials: { accessKeyId: cfg.S3_ACCESS_KEY, secretAccessKey: cfg.S3_SECRET_KEY },
    });
  }
  return client;
}

export async function ensureBucket(): Promise<void> {
  const Bucket = getConfig().S3_BUCKET;
  try {
    await s3().send(new HeadBucketCommand({ Bucket }));
  } catch {
    try {
      await s3().send(new CreateBucketCommand({ Bucket }));
      logger.info({ bucket: Bucket }, 'created bucket');
    } catch (err) {
      // Another worker may have created it a moment ago.
      const name = (err as { name?: string }).name;
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw err;
    }
  }
}

/** Retries while MinIO is still starting up. */
export async function ensureBucketWithRetry(attempts = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await ensureBucket();
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      logger.warn({ err: (err as Error).message, attempt: i }, 'object storage not ready, retrying');
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function putPdf(key: string, body: Buffer): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key, Body: body, ContentType: 'application/pdf' }),
  );
}

export async function getPdfStream(key: string): Promise<Readable> {
  const res = await s3().send(new GetObjectCommand({ Bucket: getConfig().S3_BUCKET, Key: key }));
  return res.Body as Readable;
}
