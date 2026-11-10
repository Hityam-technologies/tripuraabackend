const multer = require('multer');
const { ApiError } = require('../utils/ApiError');
const { logger } = require('../config/logger');
const { getEnv } = require('../config/env');

function errorHandler(error, req, res, _next) {
  let status = error.statusCode || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = error.message || 'Something went wrong.';
  let details = error.details;

  if (error instanceof multer.MulterError) {
    status = 400;
    code = error.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE' : 'BAD_IMAGE';
    message = error.code === 'LIMIT_FILE_SIZE' ? 'That image is too large.' : 'Upload failed.';
  } else if (error.name === 'CastError') {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid id.';
  } else if (error.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    message = 'That value is already in use.';
  }

  if (status >= 500) {
    logger.error('request failed', { requestId: req.id, code, message: error.message });
    if (getEnv().NODE_ENV === 'production') message = 'Something went wrong.';
  }

  res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
}

module.exports = { errorHandler };
