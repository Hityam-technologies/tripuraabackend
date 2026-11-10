const { createApp } = require('../app');
const { JobRunner } = require('../services/tryon/jobRunner');
const { FashnProvider } = require('../services/tryon/fashn.provider');
const { createRuntime } = require('../services/tryon');
const { setRunner } = require('../services/tryon/tryOn.service');
const { fashnMock, resetFetch } = require('./helpers/fashnMock');
const { TINY_JPEG } = require('../services/tryon/mock.provider');
const { Semaphore } = require('../services/tryon/rateLimiter');
const { createLimiters } = require('../services/tryon/rateLimiter');
const TryOnJob = require('../models/TryOnJob');
const DrapeProfile = require('../models/DrapeProfile');
const { createVerifiedUser } = require('./helpers/authHelpers');
const { seedCategory, seedSaree, jpegBuffer } = require('./helpers/factories');
const { storage } = require('../services/storage');
const request = require('supertest');
const { auth } = require('./helpers/authHelpers');

const app = createApp();

async function portraitAndSaree({ seed = true } = {}) {
  if (seed) {
    await seedCategory();
    await seedSaree();
  }
  const user = await createVerifiedUser(app);
  const photo = await jpegBuffer();
  const uploaded = await request(app).post('/api/v1/try-on/upload-photo').set(auth(user.token)).attach('photo', photo, 'p.jpg');
  return { user, profileId: uploaded.body.data.id };
}

function install(sequence, extra = {}) {
  fashnMock(sequence);
  const provider = new FashnProvider();
  const runtime = createRuntime({ provider, pollMs: 5, timeoutMs: extra.timeoutMs || 3000, limiters: extra.limiters });
  setRunner(runtime.runner);
  app.set('jobRunner', runtime.runner);
  app.set('tryOnProvider', provider);
  return runtime;
}

describe('try-on job runner', () => {
  afterEach(() => {
    resetFetch();
    const runtime = createRuntime({ pollMs: 5 });
    setRunner(runtime.runner);
    app.set('jobRunner', runtime.runner);
  });

  test('walks provider statuses and stores output locally', async () => {
    const { user, profileId } = await portraitAndSaree();
    const calls = [];
    install((count, url) => {
      calls.push(url);
      if (url.includes('/v1/run')) return { status: 200, body: { id: 'pred-1' } };
      const steps = ['starting', 'in_queue', 'processing', 'completed'];
      const status = steps[calls.filter((item) => item.includes('/status')).length - 1] || 'completed';
      if (status !== 'completed') return { status: 200, body: { id: 'pred-1', status } };
      return { status: 200, body: { id: 'pred-1', status: 'completed', output: [`data:image/jpeg;base64,${TINY_JPEG}`], creditsUsed: 1 } };
    });
    const started = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-1',
      drapeProfileId: profileId,
    });
    await app.get('jobRunner').waitForIdle();
    const job = await TryOnJob.findById(started.body.data.jobId);
    expect(job.status).toBe('completed');
    expect(job.outputKey).toMatch(/^private\//);
    const bytes = await storage().read(job.outputKey);
    expect(bytes.length).toBeGreaterThan(20);
    expect(job.creditsUsed).toBe(1);
  });

  test('maps failed, canceled, timeout, 429, 5xx, 402, and network errors', async () => {
    const cases = [
      {
        name: 'pose',
        sequence: (count, url) => url.includes('/run')
          ? { status: 200, body: { id: 'p' } }
          : { status: 200, body: { id: 'p', status: 'failed', error: { name: 'PoseError' } } },
        code: 'TRYON_BAD_PHOTO',
        runs: 1,
      },
      {
        name: 'canceled',
        sequence: (count, url) => url.includes('/run')
          ? { status: 200, body: { id: 'p' } }
          : { status: 200, body: { id: 'p', status: 'canceled' } },
        status: 'canceled',
      },
      {
        name: 'time_out',
        sequence: (count, url) => url.includes('/run')
          ? { status: 200, body: { id: 'p' } }
          : { status: 200, body: { id: 'p', status: 'time_out' } },
        status: 'timed_out',
      },
      {
        name: '402',
        sequence: () => ({ status: 402, body: { error: 'OutOfCredits' } }),
        code: 'TRYON_UNAVAILABLE',
        runs: 1,
      },
      {
        name: '429',
        sequence: () => ({ status: 429, body: { error: 'RateLimitExceeded' } }),
        code: 'TRYON_BUSY',
        runs: 3,
      },
      {
        name: '500',
        sequence: () => ({ status: 500, body: { error: 'InternalServerError' } }),
        code: 'TRYON_UNAVAILABLE',
        runs: 3,
      },
    ];

    for (const item of cases) {
      await TryOnJob.deleteMany({});
      const { user, profileId } = await portraitAndSaree({ seed: item.name === 'pose' });
      let runs = 0;
      install((count, url) => {
        if (String(url).includes('/v1/run')) runs += 1;
        return item.sequence(count, url);
      });
      const started = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
        sareeId: 'saree-1',
        drapeProfileId: profileId,
      });
      await app.get('jobRunner').waitForIdle();
      const job = await TryOnJob.findById(started.body.data.jobId);
      if (item.status) expect(job.status).toBe(item.status);
      if (item.code) expect(job.errorCode).toBe(item.code);
      if (item.runs) expect(runs).toBe(item.runs);
      expect(JSON.stringify(job)).not.toMatch(/sk-/);
    }

    const { user, profileId } = await portraitAndSaree({ seed: false });
    let networkRuns = 0;
    fashnMock(() => {
      networkRuns += 1;
      throw new Error('socket hang up');
    });
    const provider = new FashnProvider();
    const runtime = createRuntime({ provider, pollMs: 5, timeoutMs: 2000 });
    setRunner(runtime.runner);
    const started = await request(app).post('/api/v1/try-on/generate-drape').set(auth(user.token)).send({
      sareeId: 'saree-1',
      drapeProfileId: profileId,
    });
    await runtime.runner.waitForIdle();
    const job = await TryOnJob.findById(started.body.data.jobId);
    expect(job.errorCode).toBe('TRYON_UNAVAILABLE');
    expect(networkRuns).toBe(3);
  });

  test('keeps concurrency at or below 6 and resumes queued work after restart', async () => {
    await seedCategory();
    await seedSaree();
    const user = await createVerifiedUser(app);
    const stored = await storage().put({ buffer: await jpegBuffer(), visibility: 'private', extension: 'jpg', contentType: 'image/jpeg' });
    const profile = await DrapeProfile.create({ userId: user.user.id, imageKey: stored.key, imageHash: 'hash', isPrimary: true });
    const limiters = createLimiters();
    limiters.concurrency = new Semaphore(6);
    const runner = new JobRunner({
      provider: {
        name: 'mock',
        async run() { return { id: 'slow' }; },
        async status() { return { status: 'processing', output: null }; },
      },
      limiters,
      pollMs: 50,
      timeoutMs: 80,
    });
    for (let index = 0; index < 8; index += 1) {
      await TryOnJob.create({
        userId: user.user.id,
        sareeId: 'saree-1',
        drapeProfileId: profile._id,
        provider: 'mock',
        providerModel: 'tryon-v1.6',
        status: 'queued',
        requestHash: `hash-${index}`,
      });
    }
    await runner.tick();
    expect(limiters.concurrency.peak).toBeLessThanOrEqual(6);
    expect(limiters.concurrency.peak).toBe(6);
    await runner.stop();

    const stuck = await TryOnJob.create({
      userId: user.user.id,
      sareeId: 'saree-1',
      drapeProfileId: profile._id,
      provider: 'mock',
      providerModel: 'tryon-v1.6',
      status: 'processing',
      requestHash: 'resume-me',
    });
    const next = new JobRunner({
      provider: { name: 'mock', async run() { return { id: 'resumed' }; }, async status() { return { status: 'starting' }; } },
      pollMs: 20,
      timeoutMs: 200,
    });
    await next.resume();
    await next.waitForIdle();
    const resumed = await TryOnJob.findById(stuck._id);
    expect(['queued', 'processing', 'timed_out', 'completed', 'failed']).toContain(resumed.status);
    expect(resumed.status).not.toBe('processing');
    await next.stop();
  });
});
