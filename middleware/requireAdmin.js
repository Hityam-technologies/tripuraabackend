const { ApiError } = require('../utils/ApiError');
const { verifyAccess } = require('../services/token.service');
const Admin = require('../models/Admin');

async function requireAdmin(req, _res, next) {
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
    if (payload.aud !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'This token cannot access this resource.');
    const admin = await Admin.findById(payload.sub);
    if (!admin) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
    req.admin = admin;
    req.auth = payload;
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireAdmin };
