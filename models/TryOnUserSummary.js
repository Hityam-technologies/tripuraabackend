const mongoose = require('mongoose');

const tryOnUserSummarySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, default: '', index: true },
    phone: { type: String, default: '', index: true },
    email: { type: String, default: '', index: true },
    joinedAt: { type: Date, default: null },
    firstTryOnAt: { type: Date, default: null },
    lastTryOnAt: { type: Date, default: null },
    tryOnsStarted: { type: Number, default: 0 },
    tryOnsCompleted: { type: Number, default: 0 },
    tryOnsFailed: { type: Number, default: 0 },
    cacheHits: { type: Number, default: 0 },
    freeGranted: { type: Number, default: 0 },
    freeUsed: { type: Number, default: 0 },
    freeReserved: { type: Number, default: 0 },
    freeRemaining: { type: Number, default: 0 },
    paidPurchased: { type: Number, default: 0 },
    paidUsed: { type: Number, default: 0 },
    paidReserved: { type: Number, default: 0 },
    paidRemaining: { type: Number, default: 0 },
    moneyPaidPaise: { type: Number, default: 0 },
    paymentCount: { type: Number, default: 0 },
    refundPaise: { type: Number, default: 0 },
    refundCount: { type: Number, default: 0 },
    moneyNetPaise: { type: Number, default: 0 },
    fashnCreditsUsed: { type: Number, default: 0 },
    fashnCreditsFree: { type: Number, default: 0 },
    fashnCreditsPaid: { type: Number, default: 0 },
    fashnCreditsUnknown: { type: Number, default: 0 },
    fashnCostPaise: { type: Number, default: 0 },
    fashnCostFreePaise: { type: Number, default: 0 },
    fashnCostPaidPaise: { type: Number, default: 0 },
    netMarginPaise: { type: Number, default: 0 },
  },
  { timestamps: true },
);

tryOnUserSummarySchema.index({ fashnCreditsUsed: -1 });
tryOnUserSummarySchema.index({ fashnCostPaise: -1 });
tryOnUserSummarySchema.index({ moneyNetPaise: -1 });
tryOnUserSummarySchema.index({ moneyPaidPaise: -1 });
tryOnUserSummarySchema.index({ netMarginPaise: 1 });
tryOnUserSummarySchema.index({ tryOnsCompleted: -1 });
tryOnUserSummarySchema.index({ tryOnsFailed: -1 });
tryOnUserSummarySchema.index({ cacheHits: -1 });
tryOnUserSummarySchema.index({ freeUsed: -1 });
tryOnUserSummarySchema.index({ paidUsed: -1 });
tryOnUserSummarySchema.index({ lastTryOnAt: -1 });
tryOnUserSummarySchema.index({ joinedAt: -1 });
tryOnUserSummarySchema.index({ tryOnsStarted: 1, freeUsed: 1, moneyNetPaise: 1 });

module.exports = mongoose.model('TryOnUserSummary', tryOnUserSummarySchema);
