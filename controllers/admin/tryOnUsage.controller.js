const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const usage = require('../../services/tryon/usage.service');

function actor(req) {
  return { id: String(req.admin._id), name: req.admin.name || 'Admin' };
}

function meta(req) {
  return { ip: req.ip || '', userAgent: req.get('user-agent') || '' };
}

const users = asyncHandler(async (req, res) => {
  sendOk(res, await usage.listUsers(req.queryData));
});

const user = asyncHandler(async (req, res) => {
  sendOk(res, await usage.userDetail(req.params.userId, req.queryData, actor(req), meta(req)));
});

const exportCsv = asyncHandler(async (req, res) => {
  const csv = await usage.exportCsv(req.queryData, actor(req), meta(req));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="tryon-usage.csv"');
  res.status(200).send(csv);
});

const settings = asyncHandler(async (_req, res) => {
  sendOk(res, await usage.getSettings());
});

const updateSettings = asyncHandler(async (req, res) => {
  sendOk(res, await usage.updateSettings(req.body, actor(req), meta(req)));
});

const reconcile = asyncHandler(async (req, res) => {
  sendOk(res, await usage.reconcile({ repair: req.body?.repair === true }));
});

module.exports = { users, user, exportCsv, settings, updateSettings, reconcile };
