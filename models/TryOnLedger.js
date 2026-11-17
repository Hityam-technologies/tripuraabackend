const mongoose = require('mongoose');

const tryOnLedgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'TryOnJob', default: null },
    type: {
      type: String,
      enum: ['grant', 'purchase', 'reserve', 'consume', 'release', 'refund', 'admin_adjust', 'cache_hit'],
      required: true,
    },
    bucket: { type: String, enum: ['FREE', 'PAID', 'NONE', 'UNKNOWN'], default: 'NONE' },
    tryOns: { type: Number, default: 0 },
    fashnCredits: { type: Number, default: 0 },
    amountPaise: { type: Number, default: 0 },
    note: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true },
);

tryOnLedgerSchema.index({ userId: 1, type: 1, createdAt: -1 });
tryOnLedgerSchema.index(
  { jobId: 1, type: 1 },
  { unique: true, partialFilterExpression: { jobId: { $type: 'objectId' } } },
);

module.exports = mongoose.model('TryOnLedger', tryOnLedgerSchema);
