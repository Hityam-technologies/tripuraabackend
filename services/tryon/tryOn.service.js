const { ApiError } = require('../../utils/ApiError');
const { sha256 } = require('../../utils/tokens');
const { formatInr } = require('../../utils/price');
const { pageMeta } = require('../../utils/pagination');
const { getEnv } = require('../../config/env');
const { storage } = require('../storage');
const { getOrCreate } = require('../systemConfig.service');
const DrapeProfile = require('../../models/DrapeProfile');
const TryOnJob = require('../../models/TryOnJob');
const SavedTryOnLook = require('../../models/SavedTryOnLook');
const Saree = require('../../models/Saree');
const User = require('../../models/User');

let runner = null;

function setRunner(next) {
  runner = next;
}

function getRunner() {
  if (!runner) throw new ApiError(503, 'TRYON_UNAVAILABLE', 'Virtual try-on is temporarily unavailable.');
  return runner;
}

async function signed(key) {
  if (!key) return '';
  return storage().signedUrl(key);
}

async function uploadPhoto(user, prepared) {
  await DrapeProfile.updateMany({ userId: user._id }, { isPrimary: false });
  const stored = await storage().put({
    buffer: prepared.buffer,
    visibility: 'private',
    extension: 'jpg',
    contentType: 'image/jpeg',
  });
  const profile = await DrapeProfile.create({
    userId: user._id,
    label: 'Saved Profile Photo',
    imageKey: stored.key,
    imageHash: prepared.hash,
    isPrimary: true,
  });
  return {
    id: String(profile._id),
    label: profile.label,
    isPrimary: true,
    imageUrl: await signed(profile.imageKey),
  };
}

async function listProfiles(userId) {
  const rows = await DrapeProfile.find({ userId }).sort({ createdAt: -1 });
  return Promise.all(rows.map(async (profile) => ({
    id: String(profile._id),
    label: profile.label,
    isPrimary: profile.isPrimary,
    imageUrl: await signed(profile.imageKey),
  })));
}

async function deleteProfile(user, id) {
  const profile = await DrapeProfile.findOne({ _id: id, userId: user._id });
  if (!profile) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Photo not found.');
  await storage().delete(profile.imageKey);
  await profile.deleteOne();
  if (profile.isPrimary) {
    const next = await DrapeProfile.findOne({ userId: user._id }).sort({ createdAt: -1 });
    if (next) {
      next.isPrimary = true;
      await next.save();
    }
  }
  return { id };
}

async function generate(user, { sareeId, drapeProfileId }) {
  if (getEnv().tryOnProvider === 'disabled') {
    throw new ApiError(503, 'TRYON_UNAVAILABLE', 'Virtual try-on is not available right now.');
  }
  const configDoc = await getOrCreate();
  const enabled = configDoc.featureFlags?.tryOnEnabled !== false;
  if (!enabled) throw new ApiError(403, 'TRYON_DISABLED', 'Virtual try-on is turned off right now.');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usedToday = await TryOnJob.countDocuments({ userId: user._id, createdAt: { $gte: startOfDay } });
  if (usedToday >= configDoc.tryOnDailyLimitPerUser) {
    throw new ApiError(429, 'TRYON_QUOTA', 'You have reached today’s try-on limit.');
  }
  const since = new Date(Date.now() - (configDoc.tryOnUserRateWindowMs || 600000));
  const recent = await TryOnJob.countDocuments({ userId: user._id, createdAt: { $gte: since } });
  if (recent >= (configDoc.tryOnUserRateMax || 8)) {
    throw new ApiError(429, 'RATE_LIMITED', 'Please wait a moment before starting another drape.');
  }

  const saree = await Saree.findOne({ id: sareeId, isActive: true, deletedAt: null });
  if (!saree) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${sareeId}' was not found.`);
  const profile = await DrapeProfile.findOne({ _id: drapeProfileId, userId: user._id });
  if (!profile) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Photo not found.');

  const model = configDoc.tryOnModel || getEnv().FASHN_MODEL;
  const requestHash = sha256(`${user._id}|${sareeId}|${profile.imageHash}|${model}`);
  const cached = await TryOnJob.findOne({ userId: user._id, requestHash, status: 'completed' });
  if (cached) {
    return { statusCode: 200, body: { jobId: String(cached._id), status: 'completed', cached: true } };
  }

  const job = await TryOnJob.create({
    userId: user._id,
    sareeId,
    drapeProfileId: profile._id,
    provider: getEnv().tryOnProvider,
    providerModel: model,
    status: 'queued',
    requestHash,
  });
  getRunner().tick().catch(() => null);
  return { statusCode: 202, body: { jobId: String(job._id), status: job.status } };
}

async function presentJob(job) {
  const payload = {
    id: String(job._id),
    status: job.status,
    drapeImageUrl: null,
    error: null,
  };
  if (job.status === 'completed' && job.outputKey) payload.drapeImageUrl = await signed(job.outputKey);
  if (['failed', 'canceled', 'timed_out'].includes(job.status)) {
    payload.error = { code: job.errorCode || 'TRYON_UNAVAILABLE', message: job.errorMessage || 'The drape could not be created.' };
  }
  return payload;
}

async function getJob(user, id) {
  const job = await TryOnJob.findOne({ _id: id, userId: user._id });
  if (!job) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Try-on job not found.');
  return presentJob(job);
}

async function presentLook(look, saree, profile) {
  return {
    id: String(look._id),
    sareeId: look.sareeId,
    sareeTitle: saree?.title || '',
    sareePrice: saree ? formatInr(saree.price) : '',
    weave: saree?.weave || '',
    drapeImage: await signed(look.renderKey),
    flatImage: saree?.flatImageUrl || '',
    userPhotoSource: profile ? await signed(profile.imageKey) : '',
    savedAt: look.createdAt,
    isFlagged: look.isFlagged,
  };
}

async function saveLook(user, jobId) {
  const job = await TryOnJob.findOne({ _id: jobId, userId: user._id, status: 'completed' });
  if (!job) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'A completed drape was not found.');
  const look = await SavedTryOnLook.findOneAndUpdate(
    { userId: user._id, sareeId: job.sareeId },
    { $set: { jobId: job._id, renderKey: job.outputKey, removedByAdmin: false }, $setOnInsert: { userId: user._id, sareeId: job.sareeId } },
    { upsert: true, returnDocument: 'after' },
  );
  const saree = await Saree.findOne({ id: job.sareeId }).lean();
  const profile = await DrapeProfile.findById(job.drapeProfileId);
  return presentLook(look, saree, profile);
}

async function listLooks(userId) {
  const looks = await SavedTryOnLook.find({ userId, removedByAdmin: false }).sort({ createdAt: -1 });
  const sarees = await Saree.find({ id: { $in: looks.map((look) => look.sareeId) } }).lean();
  const jobs = await TryOnJob.find({ _id: { $in: looks.map((look) => look.jobId) } });
  const profiles = await DrapeProfile.find({ _id: { $in: jobs.map((job) => job.drapeProfileId) } });
  const sareeMap = new Map(sarees.map((saree) => [saree.id, saree]));
  const jobMap = new Map(jobs.map((job) => [String(job._id), job]));
  const profileMap = new Map(profiles.map((profile) => [String(profile._id), profile]));
  return Promise.all(looks.map((look) => {
    const job = jobMap.get(String(look.jobId));
    const profile = job ? profileMap.get(String(job.drapeProfileId)) : null;
    return presentLook(look, sareeMap.get(look.sareeId), profile);
  }));
}

async function deleteLook(user, sareeId) {
  const filter = { userId: user._id, sareeId };
  if (/^[a-f\d]{24}$/i.test(sareeId)) {
    filter.$or = [{ sareeId }, { _id: sareeId }];
    delete filter.sareeId;
  }
  const result = await SavedTryOnLook.deleteOne(filter);
  return { sareeId, removed: result.deletedCount > 0 };
}

async function handleWebhook(payload) {
  if (!payload?.id) return { ignored: true };
  const job = await TryOnJob.findOne({ providerPredictionId: payload.id });
  if (!job) return { ignored: true };
  if (['completed', 'failed', 'canceled', 'timed_out'].includes(job.status)) return { duplicate: true };
  const active = getRunner();
  if (payload.status === 'completed') {
    await active.complete(job, payload);
    return { ok: true };
  }
  if (payload.status === 'failed') {
    const { mapRuntimeError } = require('./errorMapper');
    const mapped = mapRuntimeError(payload.error || {});
    await active.fail(job._id, mapped.code, mapped.message);
    return { ok: true };
  }
  if (payload.status === 'canceled' || payload.status === 'time_out') {
    const { mapTerminalStatus } = require('./errorMapper');
    const terminal = mapTerminalStatus(payload.status);
    await TryOnJob.updateOne({ _id: job._id, status: { $in: ['queued', 'processing'] } }, {
      status: terminal.status,
      errorCode: terminal.code,
      errorMessage: terminal.message,
      completedAt: new Date(),
    });
  }
  return { ok: true };
}

async function adminJobs(query) {
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  const skip = (query.page - 1) * query.limit;
  const [rows, total, grouped, creditsAgg] = await Promise.all([
    TryOnJob.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    TryOnJob.countDocuments(filter),
    TryOnJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    TryOnJob.aggregate([
      { $match: { createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } } },
      { $group: { _id: null, credits: { $sum: '$creditsUsed' } } },
    ]),
  ]);
  const sarees = await Saree.find({ id: { $in: rows.map((row) => row.sareeId) } }).select('id title').lean();
  const titles = new Map(sarees.map((saree) => [saree.id, saree.title]));
  const byStatus = Object.fromEntries(grouped.map((row) => [row._id, row.count]));
  const finished = (byStatus.completed || 0) + (byStatus.failed || 0) + (byStatus.canceled || 0) + (byStatus.timed_out || 0);
  const failed = (byStatus.failed || 0) + (byStatus.canceled || 0) + (byStatus.timed_out || 0);
  const meta = pageMeta(query.page, query.limit, total);
  return {
    items: rows.map((row) => ({
      id: String(row._id),
      sareeId: row.sareeId,
      sareeTitle: titles.get(row.sareeId) || '',
      status: row.status,
      model: row.providerModel,
      errorCode: row.errorCode || '',
      errorMessage: row.errorMessage || '',
      creditsUsed: row.creditsUsed || 0,
      durationMs: row.providerLatencyMs || 0,
      createdAt: row.createdAt,
    })),
    stats: {
      byStatus,
      failureRate: finished ? Number((failed / finished).toFixed(3)) : 0,
      creditsUsedToday: creditsAgg[0]?.credits || 0,
    },
    ...meta,
  };
}

async function creditsSummary() {
  const summary = await getRunner().provider.credits();
  const threshold = getEnv().FASHN_LOW_CREDIT_THRESHOLD;
  return {
    credits: summary.credits,
    unavailable: Boolean(summary.unavailable),
    lowCredits: Number.isFinite(summary.credits) && summary.credits < threshold,
    threshold,
  };
}

async function adminLooks(query) {
  const filter = {};
  if (query.flagged === true) filter.isFlagged = true;
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    SavedTryOnLook.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    SavedTryOnLook.countDocuments(filter),
  ]);
  const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } }).select('fullName email').lean();
  const sarees = await Saree.find({ id: { $in: rows.map((row) => row.sareeId) } }).select('id title').lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  const sareeMap = new Map(sarees.map((saree) => [saree.id, saree.title]));
  return {
    items: rows.map((row) => ({
      id: String(row._id),
      userId: String(row.userId),
      userName: userMap.get(String(row.userId))?.fullName || '',
      sareeId: row.sareeId,
      sareeTitle: sareeMap.get(row.sareeId) || '',
      isFlagged: row.isFlagged,
      flagReason: row.flagReason || '',
      removedByAdmin: row.removedByAdmin,
      createdAt: row.createdAt,
    })),
    ...pageMeta(query.page, query.limit, total),
  };
}

async function flagLook(id, { isFlagged, reason }) {
  const look = await SavedTryOnLook.findById(id);
  if (!look) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Look not found.');
  const before = { isFlagged: look.isFlagged, flagReason: look.flagReason };
  look.isFlagged = Boolean(isFlagged);
  look.flagReason = isFlagged ? (reason || '') : '';
  await look.save();
  return { before, after: { id: String(look._id), isFlagged: look.isFlagged, flagReason: look.flagReason } };
}

async function purgeExpiredRenders() {
  const days = getEnv().TRYON_RENDER_RETENTION_DAYS || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const jobs = await TryOnJob.find({
    status: 'completed',
    outputKey: { $nin: [null, ''] },
    completedAt: { $lt: cutoff },
  });
  const disk = storage();
  for (const job of jobs) {
    const saved = await SavedTryOnLook.exists({ userId: job.userId, sareeId: job.sareeId, removedByAdmin: false });
    if (saved) continue;
    await disk.delete(job.outputKey).catch(() => null);
    job.outputKey = '';
    await job.save();
  }
  return { scanned: jobs.length };
}

async function removeLookAdmin(id) {
  const look = await SavedTryOnLook.findById(id);
  if (!look) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Look not found.');
  look.removedByAdmin = true;
  await look.save();
  return { id: String(look._id), removedByAdmin: true };
}

module.exports = {
  setRunner,
  uploadPhoto,
  listProfiles,
  deleteProfile,
  generate,
  getJob,
  saveLook,
  listLooks,
  deleteLook,
  handleWebhook,
  adminJobs,
  creditsSummary,
  adminLooks,
  flagLook,
  removeLookAdmin,
  purgeExpiredRenders,
};
