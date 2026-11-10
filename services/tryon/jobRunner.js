const TryOnJob = require('../../models/TryOnJob');
const DrapeProfile = require('../../models/DrapeProfile');
const Saree = require('../../models/Saree');
const { storage } = require('../storage');
const { sleep, createLimiters } = require('./rateLimiter');
const { mapTerminalStatus } = require('./errorMapper');
const { logger } = require('../../config/logger');
const { getEnv } = require('../../config/env');
const { TRYON_TIMEOUT_MS } = require('../../config/constants');

async function downloadOutput(value) {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || typeof first !== 'string') {
    const error = new Error('The drape could not be saved.');
    error.code = 'TRYON_UNAVAILABLE';
    throw error;
  }
  if (first.startsWith('data:')) return Buffer.from(first.slice(first.indexOf(',') + 1), 'base64');
  const response = await fetch(first);
  if (!response.ok) {
    const error = new Error('The drape could not be saved.');
    error.code = 'TRYON_UNAVAILABLE';
    throw error;
  }
  return Buffer.from(await response.arrayBuffer());
}

class JobRunner {
  constructor(options = {}) {
    this.provider = options.provider;
    const limits = options.limiters || createLimiters();
    this.runBucket = limits.runBucket;
    this.statusBucket = limits.statusBucket;
    this.concurrency = limits.concurrency;
    this.timeoutMs = options.timeoutMs || TRYON_TIMEOUT_MS;
    this.pollMs = options.pollMs || 30;
    this.tasks = new Set();
    this.timer = null;
    this.stopping = false;
  }

  start() {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => {
      this.tick().catch((error) => logger.error('try-on tick failed', { message: error.message }));
    }, 200);
    this.resume().catch((error) => logger.error('try-on resume failed', { message: error.message }));
  }

  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await Promise.allSettled([...this.tasks]);
  }

  track(promise) {
    this.tasks.add(promise);
    promise.finally(() => this.tasks.delete(promise));
    return promise;
  }

  async tick() {
    if (this.stopping) return;
    while (this.concurrency.tryAcquire()) {
      const job = await TryOnJob.findOneAndUpdate(
        { status: 'queued' },
        { $set: { status: 'processing', startedAt: new Date() }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
      );
      if (!job) {
        this.concurrency.release();
        break;
      }
      if (!job.providerPredictionId && !this.runBucket.tryTake()) {
        await TryOnJob.updateOne({ _id: job._id }, { $set: { status: 'queued' }, $inc: { attempts: -1 } });
        this.concurrency.release();
        break;
      }
      this.track(this.process(job).finally(() => this.concurrency.release()));
    }
  }

  async resume() {
    const stuck = await TryOnJob.find({ status: 'processing' });
    for (const job of stuck) {
      if (!this.concurrency.tryAcquire()) break;
      if (job.providerPredictionId) {
        this.track(this.pollAndFinish(job).finally(() => this.concurrency.release()));
      } else {
        await TryOnJob.updateOne({ _id: job._id }, { status: 'queued' });
        this.concurrency.release();
      }
    }
    await this.tick();
  }

  async waitForIdle() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await this.tick();
      const open = await TryOnJob.countDocuments({ status: { $in: ['queued', 'processing'] } });
      if (open === 0 && this.tasks.size === 0) return;
      await sleep(this.pollMs);
    }
  }

  async process(job) {
    try {
      let current = job;
      if (!current.providerPredictionId) {
        current = await this.submit(current);
        if (!current) return;
      }
      await this.pollAndFinish(current);
    } catch (error) {
      logger.error('try-on job failed', { code: error.code || 'TRYON_UNAVAILABLE' });
      await this.fail(job._id, error.code || 'TRYON_UNAVAILABLE', 'Virtual try-on is temporarily unavailable.');
    }
  }

  async submit(job) {
    const profile = await DrapeProfile.findById(job.drapeProfileId);
    const saree = await Saree.findOne({ id: job.sareeId });
    if (!profile || !saree) {
      await this.fail(job._id, 'TRYON_UNAVAILABLE', 'Virtual try-on is temporarily unavailable.');
      return null;
    }
    const disk = storage();
    const portrait = await disk.read(profile.imageKey);
    const modelImage = `data:image/jpeg;base64,${portrait.toString('base64')}`;
    let garmentImage = saree.flatImageUrl;
    if (!disk.isPublicUrl(garmentImage)) {
      const image = (saree.images || []).find((item) => item.key) || null;
      if (!image?.key) {
        await this.fail(job._id, 'TRYON_UNAVAILABLE', 'This saree has no product photo.');
        return null;
      }
      const bytes = await disk.read(image.key);
      garmentImage = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    }
    const env = getEnv();
    const webhookUrl = env.PUBLIC_BASE_URL && env.WEBHOOK_SECRET
      ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/v1/webhooks/fashn?secret=${encodeURIComponent(env.WEBHOOK_SECRET)}`
      : undefined;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const result = await this.provider.run({
          modelName: job.providerModel,
          modelImage,
          garmentImage,
          webhookUrl,
        });
        job.providerPredictionId = result.id;
        job.provider = this.provider.name;
        await job.save();
        return job;
      } catch (error) {
        lastError = error;
        if (!error.retry || attempt === 3) break;
        await sleep(15 * attempt);
      }
    }
    await this.fail(job._id, lastError?.code || 'TRYON_UNAVAILABLE', lastError?.message || 'Virtual try-on is temporarily unavailable.');
    return null;
  }

  async pollAndFinish(job) {
    const started = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
    let wait = this.pollMs;
    while (Date.now() - started < this.timeoutMs) {
      const current = await TryOnJob.findById(job._id);
      if (!current || ['completed', 'failed', 'canceled', 'timed_out'].includes(current.status)) return;
      if (!this.statusBucket.tryTake()) {
        await sleep(wait);
        continue;
      }
      let snapshot;
      try {
        snapshot = await this.provider.status(current.providerPredictionId);
      } catch (error) {
        if (error.retry) {
          await sleep(wait);
          wait = Math.min(5000, wait + this.pollMs);
          continue;
        }
        await this.fail(current._id, error.code || 'TRYON_UNAVAILABLE', error.message);
        return;
      }
      if (['starting', 'in_queue', 'processing'].includes(snapshot.status)) {
        await sleep(wait);
        wait = Math.min(5000, wait + this.pollMs);
        continue;
      }
      if (snapshot.status === 'completed') {
        await this.complete(current, snapshot);
        return;
      }
      if (snapshot.status === 'failed') {
        await this.fail(
          current._id,
          snapshot.error?.code || 'TRYON_BAD_PHOTO',
          snapshot.error?.message || 'The drape could not be created.',
        );
        return;
      }
      const terminal = mapTerminalStatus(snapshot.status);
      if (terminal) {
        await TryOnJob.updateOne({ _id: current._id, status: 'processing' }, {
          status: terminal.status,
          errorCode: terminal.code,
          errorMessage: terminal.message,
          completedAt: new Date(),
        });
        return;
      }
      await sleep(wait);
    }
    await TryOnJob.updateOne({ _id: job._id, status: 'processing' }, {
      status: 'timed_out',
      errorCode: 'TRYON_UNAVAILABLE',
      errorMessage: 'The drape took too long. Please try again.',
      completedAt: new Date(),
    });
  }

  async complete(job, snapshot) {
    const fresh = await TryOnJob.findById(job._id);
    if (!fresh || fresh.status === 'completed') return fresh;
    try {
      const bytes = await downloadOutput(snapshot.output);
      const stored = await storage().put({
        buffer: bytes,
        visibility: 'private',
        extension: 'jpg',
        contentType: 'image/jpeg',
      });
      const credits = Number.isFinite(Number(snapshot.creditsUsed))
        ? Number(snapshot.creditsUsed)
        : (this.provider.name === 'mock' ? 0 : (fresh.providerModel === 'tryon-max' ? 2 : 1));
      const latency = fresh.startedAt ? Date.now() - new Date(fresh.startedAt).getTime() : 0;
      fresh.status = 'completed';
      fresh.outputKey = stored.key;
      fresh.creditsUsed = credits;
      fresh.providerLatencyMs = latency;
      fresh.completedAt = new Date();
      fresh.errorCode = '';
      fresh.errorMessage = '';
      await fresh.save();
      logger.info('try-on completed', {
        jobId: String(fresh._id),
        model: fresh.providerModel,
        ms: latency,
        creditsUsed: credits,
      });
      return fresh;
    } catch (error) {
      await this.fail(fresh._id, 'TRYON_UNAVAILABLE', 'The drape could not be saved.');
      return null;
    }
  }

  async fail(id, code, message) {
    try {
      await TryOnJob.updateOne(
        { _id: id, status: { $in: ['queued', 'processing'] } },
        { status: 'failed', errorCode: code, errorMessage: message, completedAt: new Date() },
      );
    } catch (error) {
      logger.warn('try-on fail skipped', { message: error.message });
    }
  }
}

module.exports = { JobRunner, downloadOutput };
