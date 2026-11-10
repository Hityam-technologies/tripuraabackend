const { ApiError } = require('../utils/ApiError');
const { getEnv } = require('../config/env');
const { isAdminOrigin } = require('../config/adminOrigin');
const { CSRF_HEADER } = require('../config/constants');

function csrf(req, _res, next) {
  if (req.get(CSRF_HEADER) !== 'XMLHttpRequest') {
    return next(new ApiError(403, 'CSRF', 'Missing CSRF header.'));
  }
  const origin = req.get('origin');
  if (origin && !isAdminOrigin(origin, getEnv())) {
    return next(new ApiError(403, 'CSRF', 'Origin is not allowed.'));
  }
  return next();
}

module.exports = { csrf };
