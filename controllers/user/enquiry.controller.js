const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const enquiries = require('../../services/enquiry.service');

const create = asyncHandler(async (req, res) => {
  sendOk(res, await enquiries.createEnquiry(req.user, req.body), { status: 201 });
});
const mine = asyncHandler(async (req, res) => sendOk(res, await enquiries.listMine(req.user._id)));

module.exports = { create, mine };
