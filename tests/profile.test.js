const request = require('supertest');
const { createApp } = require('../app');
const { createVerifiedUser, auth } = require('./helpers/authHelpers');

const app = createApp();

describe('profile', () => {
  test('reads, updates, and deletes the signed-in customer', async () => {
    const user = await createVerifiedUser(app);
    const me = await request(app).get('/api/v1/users/me').set(auth(user.token));
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(user.email);

    const updated = await request(app).put('/api/v1/users/me').set(auth(user.token)).send({ fullName: 'Updated Name' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.fullName).toBe('Updated Name');

    const invalid = await request(app).put('/api/v1/users/me').set(auth(user.token)).send({ fullName: 'A' });
    expect(invalid.status).toBe(400);

    const removed = await request(app).delete('/api/v1/users/me').set(auth(user.token));
    expect(removed.status).toBe(200);
    const after = await request(app).get('/api/v1/users/me').set(auth(user.token));
    expect(after.status).toBe(401);
  });
});
