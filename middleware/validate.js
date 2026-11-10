const { ApiError, zodDetails } = require('../utils/ApiError');

function validate({ body, query, params } = {}) {
  return (req, _res, next) => {
    if (body) {
      const parsed = body.safeParse(req.body ?? {});
      if (!parsed.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request.', zodDetails(parsed.error)));
      req.body = parsed.data;
    }
    if (query) {
      const parsed = query.safeParse(req.safeQuery || {});
      if (!parsed.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request.', zodDetails(parsed.error)));
      req.queryData = parsed.data;
    }
    if (params) {
      const parsed = params.safeParse(req.safeParams || req.params || {});
      if (!parsed.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Invalid request.', zodDetails(parsed.error)));
      req.paramsData = parsed.data;
    }
    return next();
  };
}

module.exports = { validate };
