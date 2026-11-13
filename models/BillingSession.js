const mongoose = require('mongoose');

const billingSessionSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

billingSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BillingSession', billingSessionSchema);
