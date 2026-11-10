const request = require('supertest');
const { createApp } = require('../app');
const Admin = require('../models/Admin');
const { createVerifiedUser } = require('./helpers/authHelpers');
const { createAdminSession } = require('./helpers/authHelpers');
const { CSRF_HEADER } = require('../config/constants');
const { getOutbox } = require('../services/email.service');

const app = createApp();

function csrf(cookies) {
  return request(app)
    .post('/api/v1/admin/auth/refresh')
    .set('Cookie', cookies)
    .set(CSRF_HEADER, 'XMLHttpRequest')
    .set('Origin', 'http://localhost:5173');
}

describe('admin auth', () => {
  test('a customer cannot sign in as admin and a second admin is refused', async () => {
    const customer = await createVerifiedUser(app);
    const denied = await request(app).post('/api/v1/admin/auth/login').send({
      email: customer.email,
      password: customer.password,
    });
    expect(denied.status).toBe(401);
    expect(denied.body.error.message).toBe('Invalid email or password.');

    const admin = await createAdminSession(app);
    expect(admin.response.status).toBe(200);
    expect(admin.response.body.data.user.role).toBeUndefined();
    expect(admin.cookies.join(';')).toMatch(/admin_refresh/);

    const second = await createAdminSession(app, { email: 'other-admin@tripuraa.test' });
    expect(second.account.created).toBe(false);
    expect(await Admin.countDocuments()).toBe(1);
    await expect(Admin.create({
      singleton: 'admin',
      email: 'third@tripuraa.test',
      passwordHash: 'x',
      name: 'Third',
    })).rejects.toThrow();
  });

  test('cookie refresh requires CSRF, rotates, and reuse revokes the family', async () => {
    const admin = await createAdminSession(app);
    const missing = await request(app).post('/api/v1/admin/auth/refresh').set('Cookie', admin.cookies);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('CSRF');

    const badOrigin = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', admin.cookies)
      .set(CSRF_HEADER, 'XMLHttpRequest')
      .set('Origin', 'http://evil.example');
    expect(badOrigin.status).toBe(403);

    const rotated = await csrf(admin.cookies);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.token).toBeTruthy();
    const nextCookie = rotated.headers['set-cookie'];
    const reuse = await csrf(admin.cookies);
    expect(reuse.status).toBe(401);
    const family = await csrf(nextCookie);
    expect(family.status).toBe(401);
  });

  test('lockout stays generic and change-password revokes refresh', async () => {
    const admin = await createAdminSession(app);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const fail = await request(app).post('/api/v1/admin/auth/login').send({ email: admin.email, password: 'Wrong@123' });
      expect(fail.status).toBe(401);
      expect(fail.body.error.message).toBe('Invalid email or password.');
    }
    const locked = await request(app).post('/api/v1/admin/auth/login').send({ email: admin.email, password: admin.password });
    expect(locked.status).toBe(401);
    expect(locked.body.error.code).toBe('INVALID_CREDENTIALS');

    const fresh = await createAdminSession(app, { email: admin.email, resetPassword: true, password: 'Reset@1234' });
    expect(fresh.response.status).toBe(200);
    const changed = await request(app)
      .put('/api/v1/admin/auth/change-password')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ currentPassword: 'Reset@1234', newPassword: 'Newer@1234' });
    expect(changed.status).toBe(200);
    const refresh = await csrf(fresh.cookies);
    expect(refresh.status).toBe(401);

    await request(app).post('/api/v1/admin/auth/forgot-password').send({ email: admin.email });
    const code = getOutbox().at(-1).text.match(/\b(\d{6})\b/)[1];
    const reset = await request(app).post('/api/v1/admin/auth/reset-password').send({
      email: admin.email,
      code,
      newPassword: 'Final@1234',
    });
    expect(reset.status).toBe(200);
    const back = await request(app).post('/api/v1/admin/auth/login').send({ email: admin.email, password: 'Final@1234' });
    expect(back.status).toBe(200);
  });
});
