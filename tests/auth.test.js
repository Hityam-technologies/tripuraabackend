const request = require('supertest');
const { createApp } = require('../app');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { registerUser, verifyUser, createVerifiedUser, auth } = require('./helpers/authHelpers');
const { rateConfig } = require('../middleware/rateLimit');

const app = createApp();

describe('customer auth', () => {
  test('register, wrong code, expiry, reuse, and attempt limit', async () => {
    const registered = await registerUser(app);
    expect(registered.response.status).toBe(201);
    expect(registered.code).toMatch(/^\d{6}$/);

    const wrong = await verifyUser(app, registered.email, '000000');
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('OTP_INVALID');

    const again = await registerUser(app, { email: registered.email, phone: registered.phone });
    expect(again.response.status).toBe(409);

    await Otp.updateOne({ email: registered.email, purpose: 'registration' }, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await verifyUser(app, registered.email, registered.code);
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe('OTP_EXPIRED');

    const fresh = await registerUser(app);
    const verified = await verifyUser(app, fresh.email, fresh.code);
    expect(verified.status).toBe(200);
    expect(verified.body.data.accessToken).toBeTruthy();
    expect(verified.body.data.refreshToken).toBeTruthy();
    const reused = await verifyUser(app, fresh.email, fresh.code);
    expect(reused.status).toBe(400);

    const limited = await registerUser(app);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const bad = await verifyUser(app, limited.email, '111111');
      expect(bad.status).toBe(400);
    }
    const blocked = await verifyUser(app, limited.email, '111111');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('OTP_ATTEMPTS');
  });

  test('login hides unknown emails, blocks unverified and blocked accounts', async () => {
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'nope' });
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Other@123' });
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.status).toBe(401);

    const pending = await registerUser(app);
    const unverified = await request(app).post('/api/v1/auth/login').send({ email: pending.email, password: pending.password });
    expect(unverified.status).toBe(403);
    expect(unverified.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const user = await createVerifiedUser(app);
    await User.updateOne({ email: user.email }, { isBlocked: true, blockedReason: 'Paused by the atelier' });
    const blocked = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_BLOCKED');
  });

  test('refresh rotates, reuse revokes the family, logout and logout-all', async () => {
    const user = await createVerifiedUser(app);
    const first = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);
    const secondToken = first.body.data.refreshToken;
    expect(secondToken).not.toBe(user.refreshToken);

    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken });
    expect(reuse.status).toBe(401);
    const familyDead = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: secondToken });
    expect(familyDead.status).toBe(401);

    const next = await createVerifiedUser(app);
    const loggedOut = await request(app).post('/api/v1/auth/logout').send({ refreshToken: next.refreshToken });
    expect(loggedOut.status).toBe(200);
    const afterLogout = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: next.refreshToken });
    expect(afterLogout.status).toBe(401);

    const all = await createVerifiedUser(app);
    const extra = await request(app).post('/api/v1/auth/login').send({ email: all.email, password: all.password });
    const gone = await request(app).post('/api/v1/auth/logout-all').set(auth(all.token));
    expect(gone.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: all.refreshToken })).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: extra.body.data.refreshToken })).status).toBe(401);
  });

  test('forgot password does not reveal accounts and reset works', async () => {
    const user = await createVerifiedUser(app);
    const missing = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'missing@example.com' });
    const present = await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    expect(missing.status).toBe(200);
    expect(present.status).toBe(200);
    expect(missing.body.data.message).toBe(present.body.data.message);

    const { getOutbox } = require('../services/email.service');
    const code = getOutbox().at(-1).text.match(/\b(\d{6})\b/)[1];
    const reset = await request(app).post('/api/v1/auth/reset-password').send({
      email: user.email,
      code,
      newPassword: 'Newer@1234',
    });
    expect(reset.status).toBe(200);
    const oldLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'Newer@1234' });
    expect(newLogin.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: user.refreshToken })).status).toBe(401);
  });

  test('login rate limit', async () => {
    const previous = rateConfig.loginMax;
    rateConfig.loginMax = 2;
    const email = `rate${Date.now()}@example.com`;
    const first = await request(app).post('/api/v1/auth/login').send({ email, password: 'nope' });
    const second = await request(app).post('/api/v1/auth/login').send({ email, password: 'nope' });
    const third = await request(app).post('/api/v1/auth/login').send({ email, password: 'nope' });
    rateConfig.loginMax = previous;
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
  });

  test('rejects a short password and a missing token', async () => {
    const bad = await request(app).post('/api/v1/auth/register').send({
      fullName: 'A',
      email: 'not-an-email',
      phone: '1',
      password: 'short',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
    const me = await request(app).get('/api/v1/users/me');
    expect(me.status).toBe(401);
  });
});
