const request = require('supertest');
const { createApp } = require('../app');
const { createAdminSession, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree } = require('./helpers/factories');

const app = createApp();

describe('admin categories', () => {
  test('protects a category that still has sarees, then reassigns and reorders', async () => {
    await seedCategory();
    await seedCategory({ id: 'bridal', label: 'Bridal', sortOrder: 2 });
    await seedSaree();
    const admin = await createAdminSession(app);
    const blocked = await request(app).delete('/api/v1/admin/categories/sarees').set(auth(admin.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CATEGORY_IN_USE');

    const removed = await request(app).delete('/api/v1/admin/categories/sarees').set(auth(admin.token)).send({ reassignTo: 'bridal' });
    expect(removed.status).toBe(200);
    const saree = await request(app).get('/api/v1/admin/sarees/saree-1').set(auth(admin.token));
    expect(saree.body.data.category).toBe('bridal');

    const created = await request(app).post('/api/v1/admin/categories').set(auth(admin.token)).send({ id: 'tissue', label: 'Tissue' });
    expect(created.status).toBe(201);
    const duplicate = await request(app).post('/api/v1/admin/categories').set(auth(admin.token)).send({ id: 'tissue', label: 'Tissue again' });
    expect(duplicate.status).toBe(409);

    const order = await request(app).put('/api/v1/admin/categories/reorder').set(auth(admin.token)).send({ order: ['tissue', 'bridal'] });
    expect(order.status).toBe(200);
    expect(order.body.data[0].id).toBe('tissue');
  });
});
