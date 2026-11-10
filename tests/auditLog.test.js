const request = require('supertest');
const { createApp } = require('../app');
const { createAdminSession, auth } = require('./helpers/authHelpers');
const { seedCategory } = require('./helpers/factories');
const AuditLog = require('../models/AuditLog');

const app = createApp();

describe('audit log', () => {
  test('records an admin write and refuses edits', async () => {
    await seedCategory();
    const admin = await createAdminSession(app);
    await request(app).post('/api/v1/admin/categories').set(auth(admin.token)).send({ id: 'tissue', label: 'Tissue' });
    const logs = await request(app).get('/api/v1/admin/audit-logs').set(auth(admin.token));
    expect(logs.status).toBe(200);
    const created = logs.body.data.items.find((item) => item.action === 'CREATE_CATEGORY');
    expect(created.actorName).toBe('Tripuraa Admin');
    expect(created.actor.name).toBe('Tripuraa Admin');
    expect(created.actor.role).toBeUndefined();

    const edit = await request(app).put(`/api/v1/admin/audit-logs/${created.id}`).set(auth(admin.token)).send({ action: 'tamper' });
    expect(edit.status).toBe(404);
    await expect(AuditLog.updateOne({ _id: created.id }, { $set: { action: 'tamper' } })).rejects.toThrow(/append-only/);
  });
});
