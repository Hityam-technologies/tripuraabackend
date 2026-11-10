const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const auth = require('../../services/auth.service');

function meta(req) {
  return { ip: req.ip, userAgent: req.get('user-agent') || '' };
}

const register = asyncHandler(async (req, res) => {
  const result = await auth.register(req.body);
  sendOk(res, result, { status: 201, message: result.message });
});

const verifyOtp = asyncHandler(async (req, res) => {
  const result = await auth.verifyRegistration(req.body, meta(req));
  sendOk(res, result, { message: 'Email verified.' });
});

const resendOtp = asyncHandler(async (req, res) => {
  const result = await auth.resend(req.body);
  sendOk(res, result, { message: result.message });
});

const login = asyncHandler(async (req, res) => {
  sendOk(res, await auth.login(req.body, meta(req)));
});

const refresh = asyncHandler(async (req, res) => {
  sendOk(res, await auth.refresh(req.body.refreshToken, meta(req)));
});

const logout = asyncHandler(async (req, res) => {
  await auth.logout(req.body.refreshToken);
  sendOk(res, { loggedOut: true });
});

const logoutAll = asyncHandler(async (req, res) => {
  await auth.logoutAll(req.user._id);
  sendOk(res, { loggedOut: true });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await auth.forgotPassword(req.body);
  sendOk(res, result, { message: result.message });
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await auth.resetPassword(req.body);
  sendOk(res, result, { message: result.message });
});

module.exports = { register, verifyOtp, resendOtp, login, refresh, logout, logoutAll, forgotPassword, resetPassword };
