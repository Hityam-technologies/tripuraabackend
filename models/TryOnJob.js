const mongoose = require('mongoose');

const tryOnJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sareeId: { type: String, required: true },
    drapeProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'DrapeProfile', required: true },
    provider: { type: String, default: 'fashn' },
    providerModel: { type: String, default: 'tryon-v1.6' },
    providerPredictionId: { type: String, default: '', index: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'canceled', 'timed_out'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    outputKey: { type: String, default: '' },
    creditsUsed: { type: Number, default: 0 },
    requestHash: { type: String, required: true, index: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    providerLatencyMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('TryOnJob', tryOnJobSchema);
