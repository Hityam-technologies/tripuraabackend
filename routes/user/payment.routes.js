const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { asyncHandler } = require('../../utils/asyncHandler');
const { ApiError, sendOk } = require('../../utils/ApiError');
const commerce = require('../../services/commerce.service');

const availability = asyncHandler(async (_req, res) => sendOk(res, commerce.paymentAvailability()));
const startOnline = asyncHandler(async () => {
  if (!commerce.paymentAvailability().onlineEnabled) {
    throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Online payment is not set up yet. Place this order as cash on delivery.');
  }
  throw new ApiError(409, 'PAYMENT_REQUIRED', 'Online payment has to be verified before the order is placed.');
});

const router = Router();
router.use(authUser);
router.get('/availability', availability);
router.post('/create-order', startOnline);
router.post('/verify', startOnline);
module.exports = router;
