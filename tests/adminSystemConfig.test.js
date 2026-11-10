const request = require('supertest');
const { createApp } = require('../app');
const { createAdminSession, auth } = require('./helpers/authHelpers');

const app = createApp();

describe('admin system config', () => {
  test('stores try-on settings under both flag names', async () => {
    const admin = await createAdminSession(app);
    const updated = await request(app).put('/api/v1/admin/system-config').set(auth(admin.token)).send({
      enableTryOn: false,
      tryOnModel: 'tryon-max',
      tryOnDailyLimitPerUser: 4,
      forceUpdate: true,
      minAppVersion: '1.2.0',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.featureFlags.tryOnEnabled).toBe(false);
    expect(updated.body.data.featureFlags.enableTryOn).toBe(false);
    expect(updated.body.data.tryOnModel).toBe('tryon-max');

    const pub = await request(app).get('/api/v1/system/config');
    expect(pub.body.data.forceUpdate).toBe(true);
    expect(pub.body.data.minAppVersion).toBe('1.2.0');
    expect(pub.body.data.featureFlags.tryOnEnabled).toBe(false);

    const paused = await request(app).put('/api/v1/admin/system-config').set(auth(admin.token)).send({
      maintenanceMode: true,
      maintenanceNotice: 'The atelier is closed for loom care.',
    });
    expect(paused.status).toBe(200);
    expect(paused.body.data.maintenanceMode).toBe(true);
    const pausedPublic = await request(app).get('/api/v1/system/config');
    expect(pausedPublic.body.data.maintenanceMode).toBe(true);
    expect(pausedPublic.body.data.maintenanceNotice).toBe('The atelier is closed for loom care.');

    const rewritten = await request(app).put('/api/v1/admin/system-config').set(auth(admin.token)).send({
      maintenanceNotice: 'Back at 6 pm.',
      featureFlags: { enableWishlistSharing: false, enableVideoReelsAutoplay: false },
    });
    expect(rewritten.status).toBe(200);
    expect(rewritten.body.data.maintenanceNotice).toBe('Back at 6 pm.');
    expect(rewritten.body.data.maintenanceMode).toBe(true);
    expect(rewritten.body.data.featureFlags.enableWishlistSharing).toBe(false);
    expect(rewritten.body.data.featureFlags.enableVideoReelsAutoplay).toBe(false);
    expect(rewritten.body.data.updatedBy).toBeTruthy();

    const bad = await request(app).put('/api/v1/admin/system-config').set(auth(admin.token)).send({ tryOnModel: 'other' });
    expect(bad.status).toBe(400);
  });
});
