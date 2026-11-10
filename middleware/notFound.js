const { ApiError } = require('../utils/ApiError');

function notFound(req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
}

module.exports = { notFound };
