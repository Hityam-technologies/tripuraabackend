const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, createAdminSession, auth } = require('./helpers/authHelpers');
const { seedSaree } = require('./helpers/factories');

const app = createApp();

describe('admin users', () => {
  test('searches customers and blocking revokes refresh tokens', async () => {
    const customer = await createVerifiedUser(app, { fullName: 'Samyuktha Rao' });
    const admin = await createAdminSession(app);
    const list = await request(app).get('/api/v1/admin/users?search=Samyuktha').set(auth(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.data.items[0].email).toBe(customer.email);
    expect(list.body.data.items[0].role).toBeUndefined();

    const missingRole = await request(app).put(`/api/v1/admin/users/${customer.user.id}/role`).set(auth(admin.token)).send({ role: 'manager' });
    expect(missingRole.status).toBe(404);

    const blocked = await request(app).put(`/api/v1/admin/users/${customer.user.id}/block`).set(auth(admin.token)).send({
      isBlocked: true,
      reason: 'Chargeback review',
    });
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.isBlocked).toBe(true);
    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: customer.refreshToken });
    expect(refresh.status).toBe(401);
    const login = await request(app).post('/api/v1/auth/login').send({ email: customer.email, password: customer.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_BLOCKED');

    const unblocked = await request(app).patch(`/api/v1/admin/users/${customer.user.id}/unblock`).set(auth(admin.token));
    expect(unblocked.body.data.isBlocked).toBe(false);
  });

  test('wishlist count matches the sarees still saved', async () => {
    const customer = await createVerifiedUser(app, { fullName: 'Chaitanya' });
    const admin = await createAdminSession(app);
    await seedSaree({ id: 'saree-1', slug: 'one' });
    await seedSaree({ id: 'saree-2', slug: 'two', title: 'Second Silk' });
    await request(app).post('/api/v1/users/me/wishlist/saree-1').set(auth(customer.token));
    await request(app).post('/api/v1/users/me/wishlist/saree-1').set(auth(customer.token));
    await request(app).delete('/api/v1/users/me/wishlist/saree-1').set(auth(customer.token));
    await request(app).post('/api/v1/users/me/wishlist/saree-2').set(auth(customer.token));

    const list = await request(app).get('/api/v1/admin/users?search=Chaitanya').set(auth(admin.token));
    expect(list.body.data.items[0].wishlistCount).toBe(1);
    expect(list.body.data.items[0].joinedDate).toBeTruthy();

    const detail = await request(app).get(`/api/v1/admin/users/${customer.user.id}`).set(auth(admin.token));
    expect(detail.body.data.wishlistSarees).toHaveLength(1);
    expect(detail.body.data.wishlistSarees[0].title).toBe('Second Silk');
    expect(detail.body.data.wishlistCount).toBe(1);
  });
});
