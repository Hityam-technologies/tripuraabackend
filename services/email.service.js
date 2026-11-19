const nodemailer = require('nodemailer');
const { getEnv } = require('../config/env');
const { logger } = require('../config/logger');
const { ApiError } = require('../utils/ApiError');

const outbox = [];

function getOutbox() {
  return outbox;
}

function clearOutbox() {
  outbox.length = 0;
}

async function sendMail({ to, subject, text }) {
  const env = getEnv();
  if (env.NODE_ENV === 'test') {
    outbox.push({ to, subject, text });
    return;
  }
  if (!env.SMTP_HOST) {
    if (env.NODE_ENV === 'development') {
      const code = String(text).match(/\b(\d{6})\b/);
      logger.info('development email code', { to, code: code ? code[1] : undefined });
      return;
    }
    throw new ApiError(
      503,
      'EMAIL_NOT_CONFIGURED',
      'We could not send the verification email right now. Please try again shortly, or contact the atelier on WhatsApp.',
    );
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT === 587,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  try {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text,
    });
    logger.info('email sent', { to, subject });
  } catch (error) {
    logger.error('email send failed', { to, message: error.message });
    throw new ApiError(
      503,
      'EMAIL_SEND_FAILED',
      'We could not send the verification email. Please check the address and try again in a moment.',
    );
  }
}

module.exports = { sendMail, getOutbox, clearOutbox };
