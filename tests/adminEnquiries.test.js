const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, createAdminSession, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree } = require('./helpers/factories');

const app = createApp();

describe('admin enquiries', () => {
  test('moves status, stores a note, and escapes spreadsheet formulas', async () => {
    await seedCategory();
    await seedSaree();
    const user = await createVerifiedUser(app, { fullName: '=cmd|calc' });
    const created = await request(app).post('/api/v1/orders/enquiry').set(auth(user.token)).send({
      sareeId: 'saree-1',
      message: 'Please confirm this weave.',
    });
    const id = created.body.data.id;
    const admin = await createAdminSession(app);

    const bad = await request(app).put(`/api/v1/admin/enquiries/${id}/status`).set(auth(admin.token)).send({ status: 'confirmed' });
    expect(bad.status).toBe(409);

    const contacted = await request(app).put(`/api/v1/admin/enquiries/${id}/status`).set(auth(admin.token)).send({ status: 'contacted' });
    expect(contacted.status).toBe(200);
    const note = await request(app).post(`/api/v1/admin/enquiries/${id}/notes`).set(auth(admin.token)).send({ text: 'Called the customer.' });
    expect(note.body.data.text).toBe('Called the customer.');

    const exported = await request(app).get('/api/v1/admin/enquiries/export').set(auth(admin.token));
    expect(exported.status).toBe(200);
    expect(exported.body.data.filename).toMatch(/\.csv$/);
    expect(exported.body.data.csv).toContain(`"'=cmd|calc"`);
  });
});
