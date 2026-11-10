const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree } = require('./helpers/factories');

const app = createApp();

describe('wishlist', () => {
  test('adds idempotently and isolates removal', async () => {
    await seedCategory();
    await seedSaree();
    const user = await createVerifiedUser(app);
    const first = await request(app).post('/api/v1/users/me/wishlist/saree-1').set(auth(user.token));
    const second = await request(app).post('/api/v1/users/me/wishlist/saree-1').set(auth(user.token));
    expect(first.status).toBe(201);
    expect(second.body.data.saved).toBe(true);
    const list = await request(app).get('/api/v1/users/me/wishlist').set(auth(user.token));
    expect(list.body.data.ids).toEqual(['saree-1']);
    const missing = await request(app).post('/api/v1/users/me/wishlist/nope').set(auth(user.token));
    expect(missing.status).toBe(404);
    const removed = await request(app).delete('/api/v1/users/me/wishlist/saree-1').set(auth(user.token));
    expect(removed.body.data.saved).toBe(false);
    const empty = await request(app).get('/api/v1/users/me/wishlist').set(auth(user.token));
    expect(empty.body.data.items).toEqual([]);
  });
});
