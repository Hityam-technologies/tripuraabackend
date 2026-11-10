const { ApiError } = require('../utils/ApiError');
const { sha256, safeEqual } = require('../utils/tokens');
const { generateOtpCode } = require('../utils/otp');
const { OTP_TTL_MS, OTP_MAX_ATTEMPTS } = require('../config/constants');
const { sendMail } = require('./email.service');
const Otp = require('../models/Otp');

async function issueCode(email, purpose, payload) {
  const code = generateOtpCode();
  await Otp.deleteMany({ email, purpose, usedAt: null });
  await Otp.create({
    email,
    codeHash: sha256(`${purpose}:${email}:${code}`),
    purpose,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    payload: payload || null,
  });
  const subject = purpose === 'forgot-password' || purpose === 'admin-reset'
    ? 'Tripuraa Sangrahah password reset code'
    : 'Tripuraa Sangrahah verification code';
  await sendMail({
    to: email,
    subject,
    text: `Your Tripuraa Sangrahah code is ${code}. It expires in 5 minutes. If you did not request it, ignore this email.`,
  });
  return code;
}

async function consumeCode(email, purpose, code) {
  const record = await Otp.findOne({ email, purpose, usedAt: null }).sort({ createdAt: -1 });
  if (!record) throw new ApiError(400, 'OTP_INVALID', 'The code is invalid or has expired.');
  if (record.expiresAt.getTime() < Date.now()) {
    throw new ApiError(400, 'OTP_EXPIRED', 'The code has expired. Request a new one.');
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, 'OTP_ATTEMPTS', 'Too many attempts. Request a new code.');
  }
  const expected = sha256(`${purpose}:${email}:${code}`);
  if (!safeEqual(record.codeHash, expected)) {
    record.attempts += 1;
    await record.save();
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw new ApiError(429, 'OTP_ATTEMPTS', 'Too many attempts. Request a new code.');
    }
    throw new ApiError(400, 'OTP_INVALID', 'The code is invalid or has expired.');
  }
  record.usedAt = new Date();
  await record.save();
  return record;
}

module.exports = { issueCode, consumeCode };
