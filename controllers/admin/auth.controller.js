const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const { getEnv } = require('../../config/env');
const { ADMIN_COOKIE, ADMIN_COOKIE_PATH } = require('../../config/constants');
const adminAuth = require('../../services/adminAuth.service');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') || '' };
}

function cookieOptions() {
  const env = getEnv();
  return {
    httpOnly: true,
    // Lax stays on this site across reloads. Strict was dropped on some production navigations.
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: ADMIN_COOKIE_PATH,
  };
}

function setCookie(res, token) {
  res.set('Cache-Control', 'no-store');
  res.cookie(ADMIN_COOKIE, token, {
    ...cookieOptions(),
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearCookie(res) {
  res.set('Cache-Control', 'no-store');
  // Clear options must match the cookie or the browser keeps the old session.
  res.clearCookie(ADMIN_COOKIE, cookieOptions());
}

const login = asyncHandler(async (req, res) => {
  const result = await adminAuth.login(req.body, meta(req));
  setCookie(res, result.refreshToken);
  sendOk(res, { token: result.accessToken, user: result.user });
});

const refresh = asyncHandler(async (req, res) => {
  const result = await adminAuth.refresh(req.cookies?.[ADMIN_COOKIE], meta(req));
  setCookie(res, result.refreshToken);
  sendOk(res, { token: result.accessToken, user: result.user });
});

const logout = asyncHandler(async (req, res) => {
  await adminAuth.logout(req.cookies?.[ADMIN_COOKIE], req.admin, meta(req));
  clearCookie(res);
  sendOk(res, { loggedOut: true });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await adminAuth.forgotPassword(req.body);
  sendOk(res, result, { message: result.message });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await adminAuth.resetPassword(req.body, meta(req));
  sendOk(res, result, { message: result.message });
});

const me = asyncHandler(async (req, res) => {
  sendOk(res, adminAuth.publicAdmin(req.admin));
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await adminAuth.changePassword(req.admin, req.body, meta(req));
  clearCookie(res);
  sendOk(res, result, { message: result.message });
});

module.exports = { login, refresh, logout, forgotPassword, resetPassword, me, changePassword };
