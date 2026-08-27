import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const s3 = new S3Client({
  region: env.AWS_REGION,
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
});

export function isStorageConfigured(): boolean {
  return !!(env.S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

/**
 * MinIO (used in local dev) doesn't come with the bucket pre-created — create it on boot if
 * missing. A no-op against real AWS S3, where the bucket is expected to already exist.
 */
export async function ensureBucketExists(): Promise<void> {
  if (!isStorageConfigured()) return;

  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      logger.info({ bucket: env.S3_BUCKET }, 'Created storage bucket');
    } catch (err) {
      logger.warn({ err, bucket: env.S3_BUCKET }, 'Could not create/verify storage bucket');
    }
  }
}

export async function getUploadUrl(key: string, mimeType: string): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: mimeType }),
    { expiresIn: 300 },
  );
}

export async function getDownloadUrl(key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: 3600 });
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })).catch((err) => {
    logger.warn({ err, key }, 'Failed to delete storage object');
  });
}
