const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'system', unique: true },
    minAppVersion: { type: String, default: '1.0.0' },
    forceUpdate: { type: Boolean, default: false },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceNotice: { type: String, default: '', maxlength: 500 },
    updatedBy: { type: String, default: '' },
    featureFlags: {
      tryOnEnabled: { type: Boolean, default: true },
      enableBespokeConcierge: { type: Boolean, default: true },
      enableInternationalShipping: { type: Boolean, default: false },
      enableWishlistSharing: { type: Boolean, default: true },
      enableVideoReelsAutoplay: { type: Boolean, default: true },
    },
    tryOnDailyLimitPerUser: { type: Number, default: 20 },
    tryOnUserRateMax: { type: Number, default: 8 },
    tryOnUserRateWindowMs: { type: Number, default: 10 * 60 * 1000 },
    tryOnModel: { type: String, enum: ['tryon-v1.6', 'tryon-max'], default: 'tryon-v1.6' },
    gstRate: { type: Number, default: 5, min: 0, max: 100 },
    gstInclusive: { type: Boolean, default: true },
    fashnRupeesPerCreditPaise: { type: Number, default: null },
    fashnRateAsOf: { type: Date, default: null },
    freeTryOnQuota: { type: Number, default: 3, min: 0, max: 100 },
    paidTryOnPricePaise: { type: Number, default: 2000, min: 0 },
    tryOnChargeEnforced: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
