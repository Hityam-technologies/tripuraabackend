const { ApiError } = require('../utils/ApiError');
const Admin = require('../models/Admin');
const { hashPassword, verifyPassword } = require('./auth.service');
const { issueCode, consumeCode } = require('./otp.service');
const { issueRefresh, rotateRefresh, revokeToken, revokeAll } = require('./token.service');
const { recordAudit } = require('./audit.service');

const GENERIC = 'Invalid email or password.';
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

function publicAdmin(admin) {
  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    avatar: admin.avatarUrl || '',
  };
}

async function login({ email, password }, meta) {
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  const locked = admin && admin.lockedUntil && admin.lockedUntil.getTime() > Date.now();
  const ok = admin ? await verifyPassword(admin.passwordHash, password) : false;
  if (!admin || locked || !ok) {
    if (admin && !locked) {
      admin.failedLoginCount += 1;
      if (admin.failedLoginCount >= MAX_FAILS) {
        admin.lockedUntil = new Date(Date.now() + LOCK_MS);
        admin.failedLoginCount = 0;
      }
      await admin.save();
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', GENERIC);
  }
  admin.failedLoginCount = 0;
  admin.lockedUntil = null;
  admin.lastLoginAt = new Date();
  await admin.save();
  const tokens = await issueRefresh({
    subjectId: admin._id,
    subjectType: 'admin',
    email: admin.email,
    audience: 'admin',
    ...meta,
  });
  await recordAudit({
    action: 'LOGIN',
    resource: 'admin',
    resourceId: String(admin._id),
    description: 'Admin signed in',
    actorId: String(admin._id),
    actorName: admin.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: publicAdmin(admin) };
}

async function refresh(rawToken, meta) {
  const rotated = await rotateRefresh(rawToken, { subjectType: 'admin', audience: 'admin', ...meta });
  return { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken, user: publicAdmin(rotated.admin) };
}

async function logout(rawToken, admin, meta) {
  await revokeToken(rawToken);
  if (admin) {
    await recordAudit({
      action: 'LOGOUT',
      resource: 'admin',
      resourceId: String(admin._id),
      description: 'Admin signed out',
      actorId: String(admin._id),
      actorName: admin.name,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
}

async function forgotPassword({ email }) {
  const admin = await Admin.findOne({ email });
  if (admin) await issueCode(email, 'admin-reset');
  return { message: 'If an admin account exists for that email, a reset code has been sent.' };
}

async function resetPassword({ email, code, newPassword }, meta) {
  await consumeCode(email, 'admin-reset', code);
  const admin = await Admin.findOne({ email }).select('+passwordHash');
  if (!admin) throw new ApiError(400, 'OTP_INVALID', 'The code is invalid or has expired.');
  admin.passwordHash = await hashPassword(newPassword);
  admin.failedLoginCount = 0;
  admin.lockedUntil = null;
  await admin.save();
  await revokeAll(admin._id, 'admin');
  await recordAudit({
    action: 'RESET_PASSWORD',
    resource: 'admin',
    resourceId: String(admin._id),
    description: 'Admin password reset',
    actorId: String(admin._id),
    actorName: admin.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { message: 'Password updated. Please sign in.' };
}

async function changePassword(admin, { currentPassword, newPassword }, meta) {
  const full = await Admin.findById(admin._id).select('+passwordHash');
  const ok = await verifyPassword(full.passwordHash, currentPassword);
  if (!ok) throw new ApiError(401, 'INVALID_CREDENTIALS', GENERIC);
  full.passwordHash = await hashPassword(newPassword);
  await full.save();
  await revokeAll(admin._id, 'admin');
  await recordAudit({
    action: 'CHANGE_PASSWORD',
    resource: 'admin',
    resourceId: String(admin._id),
    description: 'Admin changed password',
    actorId: String(admin._id),
    actorName: admin.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return { message: 'Password updated.' };
}

module.exports = { login, refresh, logout, forgotPassword, resetPassword, changePassword, publicAdmin };
