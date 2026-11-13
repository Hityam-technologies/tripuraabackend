const { ApiError } = require('../utils/ApiError');
const { verifyAccess } = require('../services/token.service');
const BillingStaff = require('../models/BillingStaff');
const BillingSession = require('../models/BillingSession');

async function requireBilling(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Billing sign-in required.');
    let payload;
    try {
      payload = verifyAccess(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') throw new ApiError(401, 'TOKEN_EXPIRED', 'Billing session expired.');
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid billing session.');
    }
    if (payload.aud !== 'billing') {
      throw new ApiError(403, 'FORBIDDEN', 'This token cannot open the billing register.');
    }
    const session = await BillingSession.findOne({ jti: payload.jti });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Billing session expired. Enter the PIN again.');
    }
    const staff = await BillingStaff.findById(payload.sub);
    if (!staff || !staff.isActive) throw new ApiError(401, 'UNAUTHORIZED', 'Billing sign-in required.');
    req.billingStaff = staff;
    req.auth = payload;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireBilling };
