const request = require('supertest');
const sharp = require('sharp');
const { createApp } = require('../app');
const { createVerifiedUser, auth } = require('./helpers/authHelpers');
const { seedCategory, seedSaree, jpegBuffer } = require('./helpers/factories');
const { reencodePortrait } = require('../utils/image');
const SystemConfig = require('../models/SystemConfig');
const { uploadLimits } = require('../middleware/upload');

const app = createApp();

async function readyUser() {
  await seedCategory();
  await seedSaree();
  const user = await createVerifiedUser(app);
  const photo = await jpegBuffer(400, 600);
  const uploaded = await request(app)
    .post('/api/v1/try-on/upload-photo')
    .set(auth(user.token))
    .attach('photo', photo, 'portrait.jpg');
  return { user, photo, profileId: uploaded.body.data.id, uploaded };
}

describe('try-on', () => {
  test('strips metadata, rejects a tiny or fake photo, and refuses a client image URL', async () => {
    const withExif = await sharp({
      create: { width: 300, height: 400, channels: 3, background: { r: 10, g: 20, b: 30 } },
    }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'secret-photographer' } } }).toBuffer();
    expect(withExif.includes(Buffer.from('secret-photographer'))).toBe(true);
    const cleaned = await reencodePortrait(withExif);
    expect(cleaned.buffer.includes(Buffer.from('secret-photographer'))).toBe(false);
    expect(cleaned.buffer.includes(Buffer.from('Exif'))).toBe(false);

    const user = await createVerifiedUser(app);
    const tiny = await jpegBuffer(40, 40);
    const tooSmall = await request(app).post('/api/v1/try-on/upload-photo').set(auth(user.token)).attach('photo', tiny, 'tiny.jpg');
    expect(tooSmall.status).toBe(400);

    const fake = Buffer.from('not an image but named jpg');
    const spoofed = await request(app).post('/api/v1/try-on/upload-photo').set(auth(user.token)).attach('photo', fake, 'portrait.jpg');
    expect(spoofed.status).toBe(400);

    const { user: owner, profileId } = await readyUser();
    const before = app.get('tryOnProvider').runCalls;
    const injected = await request(app).post('/api/v1/try-on/generate-drape').set(auth(owner.token)).send({
      sareeId: 'saree-1',
      drapeProfileId: profileId,
      imageUrl: 'http://169.254.169.254/latest/meta-data',
    });
    expect(injected.status).toBe(400);
    expect(app.get('tryOnProvider').runCalls).toBe(before);
  });

  test('returns 202, stores the render, caches without another run, and enforces quota', async () => {
    const { user, profileId } = await readyUser();
    const provider = app.get('tryOnProvider');
    const started = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-1',
      drapeProfileId: profileId,
    });
    expect(started.status).toBe(202);
    expect(started.body.data.status).toBe('queued');
    await app.get('jobRunner').waitForIdle();
    const done = await request(app).get(`/api/v1/try-on/jobs/${started.body.data.jobId}`).set(auth(user.token));
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('completed');
    expect(done.body.data.drapeImageUrl).toMatch(/\/api\/v1\/media\/access\?token=/);
    const calls = provider.runCalls;

    const cached = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-1',
      drapeProfileId: profileId,
    });
    expect(cached.status).toBe(200);
    expect(cached.body.data.cached).toBe(true);
    expect(provider.runCalls).toBe(calls);

    await SystemConfig.updateOne({ singleton: 'system' }, { tryOnDailyLimitPerUser: 1, tryOnUserRateMax: 50 });
    await seedSaree({ id: 'saree-2', slug: 'second', title: 'Second Weave', price: 30000, mrp: 32000 });
    const quota = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-2',
      drapeProfileId: profileId,
    });
    expect(quota.status).toBe(429);
    expect(quota.body.error.code).toBe('TRYON_QUOTA');
  });

  test('rate limit, disabled studio, other user, and saved looks', async () => {
    const { user, profileId } = await readyUser();
    const other = await createVerifiedUser(app);
    await SystemConfig.updateOne(
      { singleton: 'system' },
      { $set: { tryOnDailyLimitPerUser: 20, tryOnUserRateMax: 1, tryOnModel: 'tryon-v1.6' } },
      { upsert: true },
    );
    await seedSaree({ id: 'saree-2', slug: 'second-rate', title: 'Second Weave', price: 30000, mrp: 31000 });
    const first = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-1',
      drapeProfileId: profileId,
    });
    const limited = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-2',
      drapeProfileId: profileId,
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');

    const foreign = await request(app).get(`/api/v1/try-on/jobs/${first.body.data.jobId}`).set(auth(other.token));
    expect(foreign.status).toBe(404);
    const foreignPhoto = await request(app).delete(`/api/v1/users/me/drape-profiles/${profileId}`).set(auth(other.token));
    expect(foreignPhoto.status).toBe(404);

    await SystemConfig.updateOne({ singleton: 'system' }, { 'featureFlags.tryOnEnabled': false, tryOnUserRateMax: 8 });
    const off = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-1',
      drapeProfileId: profileId,
    });
    expect(off.status).toBe(403);
    expect(off.body.error.code).toBe('TRYON_DISABLED');

    await app.get('jobRunner').waitForIdle();
    const saved = await request(app).post('/api/v1/users/me/try-on-looks').set(auth(user.token)).send({ jobId: first.body.data.jobId });
    const again = await request(app).post('/api/v1/users/me/try-on-looks').set(auth(user.token)).send({ jobId: first.body.data.jobId });
    expect(saved.status).toBe(201);
    expect(again.status).toBe(201);
    const looks = await request(app).get('/api/v1/users/me/try-on-looks').set(auth(user.token));
    expect(looks.body.data).toHaveLength(1);
    expect(looks.body.data[0].sareeId).toBe('saree-1');
    const hidden = await request(app).get('/api/v1/users/me/try-on-looks').set(auth(other.token));
    expect(hidden.body.data).toEqual([]);
  });
});

afterEach(async () => {
  uploadLimits.portraitMax = null;
  await app.get('jobRunner').waitForIdle().catch(() => null);
});
