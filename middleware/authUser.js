const { ApiError } = require('../utils/ApiError');
const { verifyAccess } = require('../services/token.service');
const User = require('../models/User');

async function authUser(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
    let payload;
    try {
      payload = verifyAccess(token);
    } catch (error) {
      if (error.name === 'TokenExpiredError') throw new ApiError(401, 'TOKEN_EXPIRED', 'Access token expired.');
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid access token.');
    }
    if (payload.aud !== 'app') throw new ApiError(403, 'FORBIDDEN', 'This token cannot access this resource.');
    const user = await User.findById(payload.sub);
    if (!user || user.deletedAt) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
    if (user.isBlocked) throw new ApiError(403, 'ACCOUNT_BLOCKED', user.blockedReason || 'This account is blocked.');
    req.user = user;
    req.auth = payload;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authUser };
