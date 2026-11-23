const { ApiError } = require('../utils/ApiError');
const { verifyAccess } = require('../services/token.service');
const { authUser } = require('./authUser');
const { requireAdmin } = require('./requireAdmin');

async function requireUserOrAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return next(new ApiError(401, 'UNAUTHORIZED', 'Authentication required.'));
  let payload;
  try {
    payload = verifyAccess(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'TOKEN_EXPIRED', 'Access token expired.'));
    }
    return next(new ApiError(401, 'UNAUTHORIZED', 'Invalid access token.'));
  }
  if (payload.aud === 'app') return authUser(req, res, next);
  if (payload.aud === 'admin') return requireAdmin(req, res, next);
  return next(new ApiError(403, 'FORBIDDEN', 'This token cannot access this resource.'));
}

module.exports = { requireUserOrAdmin };
