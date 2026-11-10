const request = require('supertest');
const { createApp } = require('../app');
const mongoose = require('mongoose');
const TryOnJob = require('../models/TryOnJob');
const User = require('../models/User');
const { TINY_JPEG } = require('../services/tryon/mock.provider');
const { createVerifiedUser } = require('./helpers/authHelpers');

const app = createApp();

describe('fashn webhook', () => {
  test('rejects a bad secret and completes a job once', async () => {
    const user = await createVerifiedUser(app);
    const account = await User.findOne({ email: user.email });
    const job = await TryOnJob.create({
      userId: account._id,
      sareeId: 'saree-1',
      provider: 'fashn',
      providerModel: 'tryon-v1.6',
      drapeProfileId: new mongoose.Types.ObjectId(),
      providerPredictionId: 'pred-webhook',
      status: 'processing',
      requestHash: 'webhook-hash',
    });
    const bad = await request(app).post('/api/v1/webhooks/fashn?secret=wrong').send({
      id: 'pred-webhook',
      status: 'completed',
      output: [`data:image/jpeg;base64,${TINY_JPEG}`],
    });
    expect(bad.status).toBe(401);

    const ok = await request(app).post('/api/v1/webhooks/fashn?secret=test-webhook-secret').send({
      id: 'pred-webhook',
      status: 'completed',
      output: [`data:image/jpeg;base64,${TINY_JPEG}`],
      creditsUsed: 1,
    });
    expect(ok.status).toBe(200);
    const again = await request(app).post('/api/v1/webhooks/fashn?secret=test-webhook-secret').send({
      id: 'pred-webhook',
      status: 'completed',
      output: [`data:image/jpeg;base64,${TINY_JPEG}`],
    });
    expect(again.status).toBe(200);
    const saved = await TryOnJob.findById(job._id);
    expect(saved.status).toBe('completed');
    expect(saved.outputKey).toBeTruthy();
  });
});
