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

function parseFrom(from) {
  const match = String(from || '').match(/^(.*)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, '') || 'Tripuraa Sangrahah', email: match[2].trim() };
  }
  return { name: 'Tripuraa Sangrahah', email: String(from || '').trim() };
}

function createTransport(env, port) {
  const resolvedPort = Number(port) || env.SMTP_PORT || 587;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: resolvedPort,
    secure: resolvedPort === 465,
    requireTLS: resolvedPort === 587 || resolvedPort === 2525,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    // Fail fast — Render free tier often blocks SMTP and would hang register for 60–90s
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
}

async function sendViaBrevoApi(env, { to, subject, text }) {
  const sender = parseFrom(env.SMTP_FROM);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Brevo API ${response.status}: ${body.slice(0, 200)}`);
    }
    logger.info('email sent via Brevo API', { to, subject });
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaSmtp(env, { to, subject, text }) {
  // Prefer 2525 first — some cloud hosts block 587/465 but allow 2525
  const preferred = Number(env.SMTP_PORT) || 587;
  const ports = [...new Set([2525, preferred, 587, 465])];
  let lastError = null;
  for (const port of ports) {
    try {
      const transport = createTransport(env, port);
      await transport.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        text,
      });
      logger.info('email sent via SMTP', { to, subject, port });
      return;
    } catch (error) {
      lastError = error;
      logger.warn('SMTP port failed', { port, message: error.message });
    }
  }
  throw lastError || new Error('All SMTP ports failed');
}

async function sendMail({ to, subject, text }) {
  const env = getEnv();
  if (env.NODE_ENV === 'test') {
    outbox.push({ to, subject, text });
    return;
  }

  const canApi = Boolean(env.BREVO_API_KEY);
  const canSmtp = Boolean(env.SMTP_HOST);

  if (!canApi && !canSmtp) {
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

  // Prefer HTTPS API — Render (and many hosts) block outbound SMTP ports.
  if (canApi) {
    try {
      await sendViaBrevoApi(env, { to, subject, text });
      return;
    } catch (error) {
      logger.error('Brevo API send failed', { to, message: error.message });
      if (!canSmtp) {
        throw new ApiError(
          503,
          'EMAIL_SEND_FAILED',
          'We could not send the verification email. Please check the address and try again in a moment.',
        );
      }
    }
  }

  if (canSmtp) {
    try {
      await sendViaSmtp(env, { to, subject, text });
      return;
    } catch (error) {
      logger.error('SMTP send failed', { to, message: error.message });
    }
  }

  throw new ApiError(
    503,
    'EMAIL_SEND_FAILED',
    'We could not send the verification email. Please check the address and try again in a moment.',
  );
}

module.exports = { sendMail, getOutbox, clearOutbox };
