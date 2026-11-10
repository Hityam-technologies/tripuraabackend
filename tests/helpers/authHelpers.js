const request = require('supertest');
const { getOutbox, clearOutbox } = require('../../services/email.service');

async function registerUser(app, overrides = {}) {
  clearOutbox();
  const email = overrides.email || `user${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;
  const phone = overrides.phone || `+91 ${Math.floor(6000000000 + Math.random() * 3000000000)}`;
  const password = overrides.password || 'Test@1234';
  const fullName = overrides.fullName || 'Test User';
  const response = await request(app).post('/api/v1/auth/register').send({ fullName, email, phone, password });
  const mail = getOutbox().at(-1);
  const code = mail?.text?.match(/\b(\d{6})\b/)?.[1];
  return { response, email, phone, password, fullName, code };
}

async function verifyUser(app, email, code) {
  return request(app).post('/api/v1/auth/verify-otp').send({ email, code, purpose: 'registration' });
}

async function createVerifiedUser(app, overrides = {}) {
  const registered = await registerUser(app, overrides);
  const verified = await verifyUser(app, registered.email, registered.code);
  return {
    ...registered,
    verified,
    token: verified.body?.data?.accessToken,
    refreshToken: verified.body?.data?.refreshToken,
    user: verified.body?.data?.user,
  };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createAdminSession(app, overrides = {}) {
  const { createAdminAccount } = require('../../scripts/createAdmin');
  const email = (overrides.email || `admin${Date.now()}${Math.floor(Math.random() * 1000)}@tripuraa.test`).toLowerCase();
  const password = overrides.password || 'Admin@1234';
  const account = await createAdminAccount({
    email,
    password,
    name: overrides.name || 'Tripuraa Admin',
    resetPassword: Boolean(overrides.resetPassword),
  });
  const response = await request(app).post('/api/v1/admin/auth/login').send({ email, password });
  return { email, password, account, response, token: response.body?.data?.token, cookies: response.headers['set-cookie'] };
}

module.exports = { registerUser, verifyUser, createVerifiedUser, auth, createAdminSession };
