const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    refereeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    referralCode: { type: String, required: true, uppercase: true, trim: true },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
      default: 'PENDING',
      index: true,
    },
    // Snapshots so a later admin change does not rewrite a reward already promised.
    refereeInstantReward: { type: Number, default: 0, min: 0 },
    referrerReward: { type: Number, default: 0, min: 0 },
    firstOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopOrder', default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Referral', referralSchema);
