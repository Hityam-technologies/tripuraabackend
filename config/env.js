const path = require('path');
const { z } = require('zod');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().optional().default(''),
  JWT_PRIVATE_KEY: z.string().optional().default(''),
  JWT_PUBLIC_KEY: z.string().optional().default(''),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://10.0.2.2:8081'),
  ADMIN_ORIGIN: z.string().default('http://localhost:5173'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('Tripuraa Sangrahah <no-reply@tripuraa.local>'),
  FASHN_API_KEY: z.string().optional().default(''),
  FASHN_MODEL: z.enum(['tryon-v1.6', 'tryon-max']).default('tryon-v1.6'),
  TRYON_PROVIDER: z.enum(['fashn', 'mock']).optional(),
  ALLOW_MOCK_TRYON: z.string().optional().default('false'),
  PUBLIC_BASE_URL: z.string().optional().default(''),
  FASHN_LOW_CREDIT_THRESHOLD: z.coerce.number().default(20),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('auto'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),
  TRUST_PROXY: z.string().optional().default('false'),
  ADMIN_EMAIL: z.string().optional().default(''),
  ADMIN_PASSWORD: z.string().optional().default(''),
  TRYON_RENDER_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  WEBHOOK_SECRET: z.string().optional().default(''),
  PORTRAIT_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  PRODUCT_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
});

let cached = null;

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    const error = new Error(`Invalid environment configuration:\n${message}`);
    error.isEnvError = true;
    throw error;
  }

  const env = parsed.data;
  const privateKey = env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  const publicKey = env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n');
  const useRs256 = Boolean(privateKey && publicKey);
  if (!useRs256 && Buffer.byteLength(env.JWT_ACCESS_SECRET) < 32) {
    throw new Error(
      'JWT_ACCESS_SECRET must be at least 32 bytes, or set both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY.',
    );
  }

  let tryOnProvider = env.TRYON_PROVIDER;
  if (!tryOnProvider) tryOnProvider = env.FASHN_API_KEY ? 'fashn' : 'mock';

  if (env.NODE_ENV === 'production' && tryOnProvider === 'mock' && env.ALLOW_MOCK_TRYON !== 'true') {
    throw new Error('Refusing to boot with the mock try-on provider in production. Set ALLOW_MOCK_TRYON=true to override.');
  }
  if (tryOnProvider === 'fashn' && !env.FASHN_API_KEY && env.NODE_ENV === 'production') {
    throw new Error('FASHN_API_KEY is required when TRYON_PROVIDER=fashn.');
  }
  if (env.STORAGE_DRIVER === 's3' && (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)) {
    throw new Error('S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required when STORAGE_DRIVER=s3.');
  }

  cached = {
    ...env,
    JWT_PRIVATE_KEY: privateKey,
    JWT_PUBLIC_KEY: publicKey,
    useRs256,
    tryOnProvider,
    corsOrigins: env.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1',
  };
  return cached;
}

function getEnv() {
  if (!cached) return loadEnv();
  return cached;
}

function resetEnvCache() {
  cached = null;
}

module.exports = { loadEnv, getEnv, resetEnvCache };
