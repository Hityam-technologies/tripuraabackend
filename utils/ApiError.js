class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

function zodDetails(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function sendOk(res, data, extras = {}) {
  const body = {
    success: true,
    data,
    message: extras.message || 'Operation successful',
  };
  if (extras.meta) body.meta = extras.meta;
  return res.status(extras.status || 200).json(body);
}

module.exports = { ApiError, zodDetails, sendOk };
