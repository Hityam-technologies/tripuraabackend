const request = require('supertest');
const { createApp } = require('../app');

const app = createApp();

describe('health', () => {
  test('liveness and readiness', async () => {
    const live = await request(app).get('/api/v1/health');
    expect(live.status).toBe(200);
    expect(live.body.success).toBe(true);
    const ready = await request(app).get('/api/v1/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.data.db).toBe('up');
  });
});
