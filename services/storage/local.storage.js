const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { getEnv } = require('../../config/env');
const { ApiError } = require('../../utils/ApiError');
const { randomToken } = require('../../utils/tokens');

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

class LocalStorage {
  constructor() {
    const env = getEnv();
    this.root = path.resolve(env.UPLOAD_DIR);
    this.publicDir = path.join(this.root, 'public');
    this.privateDir = path.join(this.root, 'private');
  }

  async ensure() {
    await fs.mkdir(this.publicDir, { recursive: true });
    await fs.mkdir(this.privateDir, { recursive: true });
  }

  baseUrl() {
    const env = getEnv();
    if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/$/, '');
    return `http://localhost:${env.PORT}`;
  }

  async put({ buffer, visibility, extension }) {
    await this.ensure();
    const name = `${randomToken(16)}.${extension || 'jpg'}`;
    const key = `${visibility}/${name}`;
    await fs.writeFile(path.join(this.root, key), buffer);
    return { key, url: visibility === 'public' ? `${this.baseUrl()}/uploads/${key}` : '' };
  }

  async read(key) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(this.root)) throw new ApiError(400, 'BAD_KEY', 'Invalid storage key.');
    return fs.readFile(resolved);
  }

  async delete(key) {
    if (!key) return;
    await fs.rm(path.join(this.root, key), { force: true });
  }

  signedUrl(key, ttlSeconds = 600) {
    const env = getEnv();
    const exp = Date.now() + ttlSeconds * 1000;
    const payload = `${key}.${exp}`;
    const sig = signPayload(payload, env.JWT_ACCESS_SECRET || 'media');
    const token = Buffer.from(JSON.stringify({ key, exp, sig })).toString('base64url');
    return `${this.baseUrl()}/api/v1/media/access?token=${token}`;
  }

  verifyToken(token) {
    const env = getEnv();
    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      throw new ApiError(401, 'BAD_MEDIA_TOKEN', 'Invalid media token.');
    }
    const expected = signPayload(`${parsed.key}.${parsed.exp}`, env.JWT_ACCESS_SECRET || 'media');
    const left = Buffer.from(String(parsed.sig));
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right) || Number(parsed.exp) < Date.now()) {
      throw new ApiError(401, 'BAD_MEDIA_TOKEN', 'Invalid or expired media token.');
    }
    return parsed.key;
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

module.exports = { LocalStorage };
