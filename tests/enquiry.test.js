const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree } = require('./helpers/factories');

const app = createApp();

describe('enquiries', () => {
  test('creates an enquiry for an active saree and lists only the owner', async () => {
    await seedCategory();
    await seedSaree();
    const user = await createVerifiedUser(app);
    const created = await request(app).post('/api/v1/orders/enquiry').set(auth(user.token)).send({
      sareeId: 'saree-1',
      message: 'Please hold this weave for a bridal consultation.',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('new');
    const mine = await request(app).get('/api/v1/users/me/enquiries').set(auth(user.token));
    expect(mine.body.data).toHaveLength(1);

    const missing = await request(app).post('/api/v1/orders/enquiry').set(auth(user.token)).send({
      sareeId: 'missing',
      message: 'Hello there',
    });
    expect(missing.status).toBe(404);
    const open = await request(app).post('/api/v1/orders/enquiry').send({ sareeId: 'saree-1', message: 'Hello there' });
    expect(open.status).toBe(401);
  });
});
