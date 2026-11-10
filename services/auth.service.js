const argon2 = require('argon2');
const { getEnv } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const User = require('../models/User');
const { issueCode, consumeCode } = require('./otp.service');
const { issueRefresh, rotateRefresh, revokeToken, revokeAll } = require('./token.service');

const GENERIC_LOGIN = 'Invalid email or password.';
const GENERIC_RESET = 'If an account exists for that email, a reset code has been sent.';

function argonOptions() {
  const test = getEnv().NODE_ENV === 'test';
  return {
    type: argon2.argon2id,
    memoryCost: test ? 8192 : 19456,
    timeCost: test ? 2 : 3,
    parallelism: 1,
  };
}

async function hashPassword(password) {
  return argon2.hash(password, argonOptions());
}

async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

function publicUser(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl || '',
    isEmailVerified: user.isEmailVerified,
    isBlocked: Boolean(user.isBlocked),
    createdAt: user.createdAt || null,
    joinedDate: user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '',
  };
}

async function register({ fullName, email, phone, password }) {
  const existing = await User.findOne({ $or: [{ email }, { phone }], deletedAt: null });
  if (existing) throw new ApiError(409, 'ACCOUNT_EXISTS', 'An account with that email or phone already exists.');
  const user = await User.create({
    fullName,
    email,
    phone,
    passwordHash: await hashPassword(password),
    isEmailVerified: false,
  });
  await issueCode(email, 'registration', { userId: String(user._id) });
  return { message: 'Verification code sent.' };
}

async function verifyRegistration({ email, code }, meta) {
  await consumeCode(email, 'registration', code);
  const user = await User.findOne({ email, deletedAt: null });
  if (!user) throw new ApiError(400, 'OTP_INVALID', 'The code is invalid or has expired.');
  user.isEmailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueRefresh({
    subjectId: user._id,
    subjectType: 'user',
    email: user.email,
    audience: 'app',
    ...meta,
  });
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: publicUser(user) };
}

async function resend({ email, purpose }) {
  const allowed = purpose === 'forgot-password' ? 'forgot-password' : 'registration';
  const user = await User.findOne({ email, deletedAt: null });
  const generic = allowed === 'forgot-password'
    ? GENERIC_RESET
    : 'If the account is waiting for verification, a new code has been sent.';
  if (!user) return { message: generic };
  if (allowed === 'registration' && user.isEmailVerified) return { message: generic };
  if (user.isBlocked) return { message: generic };
  await issueCode(email, allowed);
  return { message: generic };
}

async function login({ email, password }, meta) {
  const user = await User.findOne({ email, deletedAt: null }).select('+passwordHash');
  if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN);
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new ApiError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN);
  if (!user.isEmailVerified) throw new ApiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email before signing in.');
  if (user.isBlocked) throw new ApiError(403, 'ACCOUNT_BLOCKED', user.blockedReason || 'This account is blocked.');
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueRefresh({
    subjectId: user._id,
    subjectType: 'user',
    email: user.email,
    audience: 'app',
    ...meta,
  });
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user: publicUser(user) };
}

async function refresh(rawToken, meta) {
  const rotated = await rotateRefresh(rawToken, { subjectType: 'user', audience: 'app', ...meta });
  return {
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    user: publicUser(rotated.user),
  };
}

async function logout(rawToken) {
  await revokeToken(rawToken);
}

async function logoutAll(userId) {
  await revokeAll(userId, 'user');
}

async function forgotPassword({ email }) {
  const user = await User.findOne({ email, deletedAt: null, isEmailVerified: true, isBlocked: false });
  if (user) await issueCode(email, 'forgot-password');
  return { message: GENERIC_RESET };
}

async function resetPassword({ email, code, newPassword }) {
  await consumeCode(email, 'forgot-password', code);
  const user = await User.findOne({ email, deletedAt: null }).select('+passwordHash');
  if (!user) throw new ApiError(400, 'OTP_INVALID', 'The code is invalid or has expired.');
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  await revokeAll(user._id, 'user');
  return { message: 'Password updated. Please sign in.' };
}

module.exports = {
  hashPassword,
  verifyPassword,
  publicUser,
  register,
  verifyRegistration,
  resend,
  login,
  refresh,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword,
};
