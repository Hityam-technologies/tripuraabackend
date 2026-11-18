const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const referral = require('../../services/referral.service');

function actor(req) {
  return { id: String(req.admin._id), name: req.admin.name || 'Admin' };
}

function meta(req) {
  return { ip: req.ip || '', userAgent: req.get('user-agent') || '' };
}

const settings = asyncHandler(async (_req, res) => {
  sendOk(res, referral.presentProgram(await referral.getProgram()));
});

const saveSettings = asyncHandler(async (req, res) => {
  sendOk(res, await referral.saveProgram(req.body, actor(req), meta(req)));
});

const list = asyncHandler(async (req, res) => {
  sendOk(res, await referral.adminList(req.queryData));
});

module.exports = { settings, saveSettings, list };
