const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const referral = require('../../services/referral.service');

const validateCode = asyncHandler(async (req, res) => {
  sendOk(res, await referral.validateCode(req.paramsData.code));
});

const mine = asyncHandler(async (req, res) => {
  sendOk(res, await referral.myDashboard(req.user));
});

module.exports = { validateCode, mine };
