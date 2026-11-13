const { getEnv } = require('../config/env');
const SystemConfig = require('../models/SystemConfig');

function presentConfig(doc) {
  const flags = doc.featureFlags || {};
  const tryOnEnabled = flags.tryOnEnabled !== false;
  return {
    minAppVersion: doc.minAppVersion,
    forceUpdate: doc.forceUpdate,
    maintenanceMode: Boolean(doc.maintenanceMode),
    maintenanceNotice: doc.maintenanceNotice || '',
    featureFlags: {
      tryOnEnabled,
      enableTryOn: tryOnEnabled,
      enableBespokeConcierge: flags.enableBespokeConcierge !== false,
      enableInternationalShipping: Boolean(flags.enableInternationalShipping),
      enableWishlistSharing: flags.enableWishlistSharing !== false,
      enableVideoReelsAutoplay: flags.enableVideoReelsAutoplay !== false,
    },
    tryOnDailyLimitPerUser: doc.tryOnDailyLimitPerUser,
    tryOnUserRateMax: doc.tryOnUserRateMax,
    tryOnUserRateWindowMs: doc.tryOnUserRateWindowMs,
    tryOnModel: doc.tryOnModel,
    gstRate: Number.isFinite(doc.gstRate) ? doc.gstRate : 5,
    gstInclusive: doc.gstInclusive !== false,
    updatedAt: doc.updatedAt || null,
    updatedBy: doc.updatedBy || '',
  };
}

async function getOrCreate() {
  let doc = await SystemConfig.findOne({ singleton: 'system' });
  if (!doc) {
    doc = await SystemConfig.create({ singleton: 'system', tryOnModel: getEnv().FASHN_MODEL });
  }
  return doc;
}

async function getPublicConfig() {
  return presentConfig(await getOrCreate());
}

async function updateConfig(patch, actor) {
  const doc = await getOrCreate();
  const before = presentConfig(doc);
  if (patch.minAppVersion != null) doc.minAppVersion = patch.minAppVersion;
  if (patch.forceUpdate != null) doc.forceUpdate = patch.forceUpdate;
  if (patch.maintenanceMode != null) doc.maintenanceMode = patch.maintenanceMode;
  if (patch.maintenanceNotice != null) doc.maintenanceNotice = patch.maintenanceNotice;
  if (patch.tryOnDailyLimitPerUser != null) doc.tryOnDailyLimitPerUser = patch.tryOnDailyLimitPerUser;
  if (patch.tryOnUserRateMax != null) doc.tryOnUserRateMax = patch.tryOnUserRateMax;
  if (patch.tryOnModel) doc.tryOnModel = patch.tryOnModel;
  if (patch.gstRate != null) doc.gstRate = patch.gstRate;
  if (patch.gstInclusive != null) doc.gstInclusive = patch.gstInclusive;
  const flags = { ...(doc.featureFlags?.toObject?.() || doc.featureFlags || {}) };
  const enabled = patch.tryOnEnabled ?? patch.enableTryOn ?? patch.featureFlags?.tryOnEnabled ?? patch.featureFlags?.enableTryOn;
  if (enabled != null) flags.tryOnEnabled = Boolean(enabled);
  if (patch.featureFlags?.enableBespokeConcierge != null) flags.enableBespokeConcierge = patch.featureFlags.enableBespokeConcierge;
  if (patch.featureFlags?.enableInternationalShipping != null) {
    flags.enableInternationalShipping = patch.featureFlags.enableInternationalShipping;
  }
  if (patch.featureFlags?.enableWishlistSharing != null) flags.enableWishlistSharing = patch.featureFlags.enableWishlistSharing;
  if (patch.featureFlags?.enableVideoReelsAutoplay != null) {
    flags.enableVideoReelsAutoplay = patch.featureFlags.enableVideoReelsAutoplay;
  }
  doc.featureFlags = flags;
  doc.markModified('featureFlags');
  const actorName = actor?.email || actor?.name;
  if (actorName) doc.updatedBy = actorName;
  await doc.save();
  return { before, after: presentConfig(doc) };
}

module.exports = { getOrCreate, getPublicConfig, updateConfig, presentConfig };
