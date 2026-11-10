const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree } = require('./helpers/factories');

const app = createApp();

describe('data isolation', () => {
  test('user A cannot see user B wishlist, enquiry, or profile', async () => {
    await seedCategory();
    await seedSaree();
    const a = await createVerifiedUser(app);
    const b = await createVerifiedUser(app);
    await request(app).post('/api/v1/users/me/wishlist/saree-1').set(auth(a.token));
    await request(app).post('/api/v1/orders/enquiry').set(auth(a.token)).send({
      sareeId: 'saree-1',
      message: 'Private note from A',
    });

    const wishlist = await request(app).get('/api/v1/users/me/wishlist').set(auth(b.token));
    expect(wishlist.body.data.items).toEqual([]);
    const enquiries = await request(app).get('/api/v1/users/me/enquiries').set(auth(b.token));
    expect(enquiries.body.data).toEqual([]);
    const profile = await request(app).get('/api/v1/users/me').set(auth(b.token));
    expect(profile.body.data.email).toBe(b.email);
    expect(profile.body.data.email).not.toBe(a.email);
  });
});
