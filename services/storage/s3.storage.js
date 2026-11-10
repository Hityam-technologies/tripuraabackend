const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getEnv } = require('../../config/env');
const { randomToken } = require('../../utils/tokens');

class S3Storage {
  constructor() {
    const env = getEnv();
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION || 'auto',
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(env.S3_ENDPOINT),
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  baseUrl() {
    const env = getEnv();
    return (env.S3_PUBLIC_BASE_URL || env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  }

  async put({ buffer, visibility, extension, contentType }) {
    const key = `${visibility}/${randomToken(16)}.${extension || 'jpg'}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'image/jpeg',
    }));
    const url = visibility === 'public' && this.baseUrl() ? `${this.baseUrl()}/${key}` : '';
    return { key, url };
  }

  async read(key) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key) {
    if (!key) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  signedUrl(key, ttlSeconds = 600) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds });
  }

  isPublicUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) return false;
    try {
      const host = new URL(url).hostname;
      return !['localhost', '127.0.0.1', '::1'].includes(host);
    } catch {
      return false;
    }
  }
}

module.exports = { S3Storage };
