const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const users = require('../../services/user.service');

const me = asyncHandler(async (req, res) => sendOk(res, await users.getMe(req.user)));
const updateMe = asyncHandler(async (req, res) => sendOk(res, await users.updateMe(req.user, req.body)));
const removeMe = asyncHandler(async (req, res) => {
  await users.deleteMe(req.user);
  sendOk(res, { deleted: true });
});

module.exports = { me, updateMe, removeMe };
