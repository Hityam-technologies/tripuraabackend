const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const tryOn = require('../../services/tryon/tryOn.service');
const usage = require('../../services/tryon/usage.service');

const uploadPhoto = asyncHandler(async (req, res) => {
  sendOk(res, await tryOn.uploadPhoto(req.user, req.preparedImage), { status: 201 });
});
const profiles = asyncHandler(async (req, res) => sendOk(res, await tryOn.listProfiles(req.user._id)));
const removeProfile = asyncHandler(async (req, res) => sendOk(res, await tryOn.deleteProfile(req.user, req.params.id)));
const generate = asyncHandler(async (req, res) => {
  const result = await tryOn.generate(req.user, req.body, {
    ip: req.ip || '',
    userAgent: req.get('user-agent') || '',
  });
  sendOk(res, result.body, { status: result.statusCode });
});
const job = asyncHandler(async (req, res) => sendOk(res, await tryOn.getJob(req.user, req.params.id)));
const wallet = asyncHandler(async (req, res) => sendOk(res, await usage.customerWallet(req.user)));
const saveLook = asyncHandler(async (req, res) => sendOk(res, await tryOn.saveLook(req.user, req.body.jobId), { status: 201 }));
const looks = asyncHandler(async (req, res) => sendOk(res, await tryOn.listLooks(req.user._id)));
const removeLook = asyncHandler(async (req, res) => sendOk(res, await tryOn.deleteLook(req.user, req.params.sareeId)));

module.exports = { uploadPhoto, profiles, removeProfile, generate, job, wallet, saveLook, looks, removeLook };
