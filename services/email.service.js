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
    throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured.');
  }

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}

module.exports = { sendMail, getOutbox, clearOutbox };
