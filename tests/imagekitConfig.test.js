delete process.env.IMAGEKIT_PUBLIC_KEY;
delete process.env.IMAGEKIT_PRIVATE_KEY;
delete process.env.IMAGEKIT_URL_ENDPOINT;

const request = require('supertest');
const { resetEnvCache } = require('../config/env');

resetEnvCache();

const { createApp } = require('../app');
const { createAdminSession, auth } = require('./helpers/authHelpers');

const app = createApp();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('ImageKit configuration', () => {
  test('upload explains that ImageKit is not configured', async () => {
    resetEnvCache();
    const admin = await createAdminSession(app);
    const response = await request(app)
      .post('/api/v1/media/upload/saree')
      .set(auth(admin.token))
      .attach('images', png, 'saree.png');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('IMAGEKIT_NOT_CONFIGURED');
  });
});
