const rateLimit = require('express-rate-limit');
const { ApiError } = require('../utils/ApiError');

const rateConfig = {
  generalMax: process.env.NODE_ENV === 'test' ? 10000 : 300,
  loginMax: process.env.NODE_ENV === 'test' ? 200 : 5,
  otpMax: process.env.NODE_ENV === 'test' ? 200 : 3,
  forgotMax: process.env.NODE_ENV === 'test' ? 200 : 3,
  adminLoginMax: process.env.NODE_ENV === 'test' ? 200 : 5,
};

function build({ windowMs, max, name }) {
  return rateLimit({
    windowMs,
    limit: () => max(),
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
      return `${name}:${req.ip}:${email}`;
    },
    handler(_req, _res, next) {
      next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please wait and try again.'));
    },
  });
}

module.exports = {
  rateConfig,
  generalLimiter: build({ windowMs: 60 * 1000, max: () => rateConfig.generalMax, name: 'general' }),
  loginLimiter: build({ windowMs: 60 * 1000, max: () => rateConfig.loginMax, name: 'login' }),
  otpLimiter: build({ windowMs: 5 * 60 * 1000, max: () => rateConfig.otpMax, name: 'otp' }),
  forgotLimiter: build({ windowMs: 15 * 60 * 1000, max: () => rateConfig.forgotMax, name: 'forgot' }),
  adminLoginLimiter: build({ windowMs: 15 * 60 * 1000, max: () => rateConfig.adminLoginMax, name: 'admin-login' }),
};
