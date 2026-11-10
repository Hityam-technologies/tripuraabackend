const request = require('supertest');
const { createApp } = require('../app');
const { seedCategory, seedSaree } = require('./helpers/factories');

const app = createApp();

describe('injection', () => {
  test('strips operator keys from JSON and query strings', async () => {
    await seedCategory();
    await seedSaree();
    const login = await request(app).post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(login.status).toBe(400);
    expect(login.body.error.code).toBe('VALIDATION_ERROR');

    const search = await request(app).get('/api/v1/sarees').query({ search: { $gt: '' } });
    if (search.status === 200) {
      expect(search.body.data.total).toBe(1);
    } else {
      expect(search.status).toBe(400);
    }
    const list = await request(app).get('/api/v1/sarees');
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(1);
  });
});
