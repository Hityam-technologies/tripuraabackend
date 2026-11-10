const jwt = require('jsonwebtoken');
const { getEnv } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { randomToken, sha256 } = require('../utils/tokens');
const { ACCESS_TTL, USER_REFRESH_MS, ADMIN_REFRESH_MS } = require('../config/constants');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const Admin = require('../models/Admin');

function signKey() {
  const env = getEnv();
  return env.useRs256 ? env.JWT_PRIVATE_KEY : env.JWT_ACCESS_SECRET;
}

function verifyKey() {
  const env = getEnv();
  return env.useRs256 ? env.JWT_PUBLIC_KEY : env.JWT_ACCESS_SECRET;
}

function signAccess({ sub, email, aud }) {
  const env = getEnv();
  return jwt.sign({ sub: String(sub), email }, signKey(), {
    algorithm: env.useRs256 ? 'RS256' : 'HS256',
    expiresIn: ACCESS_TTL,
    audience: aud,
    issuer: 'tripuraa',
  });
}

function verifyAccess(token) {
  const env = getEnv();
  return jwt.verify(token, verifyKey(), {
    algorithms: [env.useRs256 ? 'RS256' : 'HS256'],
    issuer: 'tripuraa',
  });
}

async function issueRefresh({ subjectId, subjectType, email, audience, userAgent, ip, familyId }) {
  const refreshToken = randomToken(32);
  const family = familyId || randomToken(16);
  const ttl = subjectType === 'admin' ? ADMIN_REFRESH_MS : USER_REFRESH_MS;
  await RefreshToken.create({
    subjectId,
    subjectType,
    tokenHash: sha256(refreshToken),
    familyId: family,
    expiresAt: new Date(Date.now() + ttl),
    userAgent: userAgent || '',
    ip: ip || '',
  });
  return {
    accessToken: signAccess({ sub: subjectId, email, aud: audience }),
    refreshToken,
    familyId: family,
  };
}

async function rotateRefresh(rawToken, { subjectType, audience, userAgent, ip }) {
  const hash = sha256(rawToken || '');
  const existing = await RefreshToken.findOneAndUpdate(
    { tokenHash: hash, isRevoked: false },
    { isRevoked: true },
    { returnDocument: 'before' },
  );

  if (!existing) {
    const reused = await RefreshToken.findOne({ tokenHash: hash });
    if (reused) await RefreshToken.updateMany({ familyId: reused.familyId }, { isRevoked: true });
    throw new ApiError(401, 'INVALID_REFRESH', 'Invalid refresh token.');
  }
  if (existing.subjectType !== subjectType) {
    await RefreshToken.updateMany({ familyId: existing.familyId }, { isRevoked: true });
    throw new ApiError(401, 'INVALID_REFRESH', 'Invalid refresh token.');
  }
  if (existing.expiresAt.getTime() < Date.now()) {
    throw new ApiError(401, 'REFRESH_EXPIRED', 'Session expired. Please sign in again.');
  }

  if (subjectType === 'user') {
    const user = await User.findById(existing.subjectId);
    if (!user || user.deletedAt) throw new ApiError(401, 'INVALID_REFRESH', 'Invalid refresh token.');
    if (user.isBlocked) {
      await RefreshToken.updateMany({ subjectId: user._id, subjectType: 'user' }, { isRevoked: true });
      throw new ApiError(403, 'ACCOUNT_BLOCKED', 'This account is blocked.');
    }
    const pair = await issueRefresh({
      subjectId: user._id,
      subjectType: 'user',
      email: user.email,
      audience,
      userAgent,
      ip,
      familyId: existing.familyId,
    });
    await RefreshToken.updateOne({ _id: existing._id }, { isRevoked: true, replacedBy: sha256(pair.refreshToken) });
    return { ...pair, user };
  }

  const admin = await Admin.findById(existing.subjectId);
  if (!admin) throw new ApiError(401, 'INVALID_REFRESH', 'Invalid refresh token.');
  const pair = await issueRefresh({
    subjectId: admin._id,
    subjectType: 'admin',
    email: admin.email,
    audience,
    userAgent,
    ip,
    familyId: existing.familyId,
  });
  await RefreshToken.updateOne({ _id: existing._id }, { isRevoked: true, replacedBy: sha256(pair.refreshToken) });
  return { ...pair, admin };
}

async function revokeToken(rawToken) {
  if (!rawToken) return;
  await RefreshToken.updateOne({ tokenHash: sha256(rawToken) }, { isRevoked: true });
}

async function revokeAll(subjectId, subjectType) {
  await RefreshToken.updateMany({ subjectId, subjectType }, { isRevoked: true });
}

module.exports = { signAccess, verifyAccess, issueRefresh, rotateRefresh, revokeToken, revokeAll };
