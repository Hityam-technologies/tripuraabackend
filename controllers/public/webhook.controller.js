const { asyncHandler } = require('../../utils/asyncHandler');
const { ApiError } = require('../../utils/ApiError');
const { safeEqual } = require('../../utils/tokens');
const { getEnv } = require('../../config/env');
const { handleWebhook } = require('../../services/tryon/tryOn.service');

const fashn = asyncHandler(async (req, res) => {
  const secret = String(req.query.secret || '');
  const expected = getEnv().WEBHOOK_SECRET;
  if (!expected || !secret || !safeEqual(secret, expected)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid webhook secret.');
  }
  await handleWebhook(req.body || {});
  res.status(200).json({ success: true });
});

module.exports = { fashn };
