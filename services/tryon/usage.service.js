const mongoose = require('mongoose');
const { ApiError } = require('../../utils/ApiError');
const { pageMeta } = require('../../utils/pagination');
const { getOrCreate } = require('../systemConfig.service');
const { recordAudit } = require('../audit.service');
const { storage } = require('../storage');
const TryOnJob = require('../../models/TryOnJob');
const TryOnLedger = require('../../models/TryOnLedger');
const TryOnUserSummary = require('../../models/TryOnUserSummary');
const User = require('../../models/User');

const SORTS = {
  fashnCredits: 'fashnCreditsUsed',
  fashnCost: 'fashnCostPaise',
  revenue: 'moneyNetPaise',
  moneyPaid: 'moneyPaidPaise',
  margin: 'netMarginPaise',
  completed: 'tryOnsCompleted',
  failed: 'tryOnsFailed',
  started: 'tryOnsStarted',
  cacheHits: 'cacheHits',
  freeUsed: 'freeUsed',
  freeRemaining: 'freeRemaining',
  paidUsed: 'paidUsed',
  paidRemaining: 'paidRemaining',
  lastTryOn: 'lastTryOnAt',
  joined: 'joinedAt',
  name: 'name',
};

function tie(query, session) {
  return session ? query.session(session) : query;
}

function inr(paise) {
  if (paise == null || !Number.isFinite(Number(paise))) return null;
  return Math.round(Number(paise)) / 100;
}

function rateOf(config) {
  const paise = config?.fashnRupeesPerCreditPaise;
  if (paise == null || !Number.isFinite(Number(paise))) return null;
  return Number(paise);
}

function applyCost(summary, ratePaise) {
  const rate = ratePaise == null ? 0 : ratePaise;
  summary.fashnCostPaise = summary.fashnCreditsUsed * rate;
  summary.fashnCostFreePaise = summary.fashnCreditsFree * rate;
  summary.fashnCostPaidPaise = summary.fashnCreditsPaid * rate;
  summary.netMarginPaise = summary.moneyNetPaise - summary.fashnCostPaise;
}

async function withTransaction(work) {
  let session = null;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (error?.code === 20 || /replica set/i.test(String(error?.message || ''))) {
      return work(null);
    }
    throw error;
  } finally {
    if (session) await session.endSession();
  }
}

async function configRate() {
  return rateOf(await getOrCreate());
}

async function ensureSummary(user, session) {
  const existing = await tie(TryOnUserSummary.findOne({ userId: user._id }), session);
  if (existing) return existing;
  const config = await getOrCreate();
  const quota = Number.isFinite(config.freeTryOnQuota) ? config.freeTryOnQuota : 3;
  const created = await TryOnUserSummary.create([{
    userId: user._id,
    name: user.fullName || '',
    phone: user.phone || '',
    email: user.email || '',
    joinedAt: user.createdAt || new Date(),
    freeGranted: quota,
    freeRemaining: quota,
  }], session ? { session } : undefined);
  await TryOnLedger.create([{
    userId: user._id,
    type: 'grant',
    bucket: 'FREE',
    tryOns: quota,
    note: 'Opening free try-ons',
  }], session ? { session } : undefined);
  return created[0];
}

async function openWallet(user) {
  return withTransaction((session) => ensureSummary(user, session));
}

async function reserve(user, meta = {}) {
  return withTransaction(async (session) => {
    const summary = await ensureSummary(user, session);
    const config = await getOrCreate();
    let bucket = 'FREE';
    if (summary.freeRemaining > 0) {
      summary.freeRemaining -= 1;
      summary.freeReserved += 1;
    } else if (summary.paidRemaining > 0 || config.tryOnChargeEnforced !== true) {
      bucket = 'PAID';
      summary.paidRemaining -= 1;
      summary.paidReserved += 1;
    } else {
      throw new ApiError(402, 'TRYON_PAYMENT_REQUIRED', 'The free try-ons are used. A paid try-on is required.');
    }
    summary.tryOnsStarted += 1;
    if (!summary.firstTryOnAt) summary.firstTryOnAt = new Date();
    summary.lastTryOnAt = new Date();
    applyCost(summary, rateOf(config));
    await summary.save(session ? { session } : undefined);
    await TryOnLedger.create([{
      userId: user._id,
      type: 'reserve',
      bucket,
      tryOns: 1,
      note: meta.note || '',
    }], session ? { session } : undefined);
    return { bucket };
  });
}

async function consume(job) {
  if (!job || job.cacheHit || job.usageSettled) return null;
  const known = job.fashnCreditsKnown === true && Number.isFinite(Number(job.fashnCreditsUsed));
  const credits = known ? Number(job.fashnCreditsUsed) : 0;
  try {
    return await withTransaction(async (session) => {
      const summary = await tie(TryOnUserSummary.findOne({ userId: job.userId }), session);
      if (!summary) return null;
      const bucket = job.customerBucket === 'PAID' ? 'PAID' : 'FREE';
      if (bucket === 'PAID') {
        summary.paidReserved = Math.max(0, summary.paidReserved - 1);
        summary.paidUsed += 1;
        summary.fashnCreditsPaid += credits;
      } else {
        summary.freeReserved = Math.max(0, summary.freeReserved - 1);
        summary.freeUsed += 1;
        summary.fashnCreditsFree += credits;
      }
      summary.tryOnsCompleted += 1;
      summary.fashnCreditsUsed += credits;
      if (!known) summary.fashnCreditsUnknown += 1;
      summary.lastTryOnAt = job.completedAt || new Date();
      applyCost(summary, await configRate());
      await summary.save(session ? { session } : undefined);
      await TryOnLedger.create([{
        userId: job.userId,
        jobId: job._id,
        type: 'consume',
        bucket,
        tryOns: 1,
        fashnCredits: credits,
        note: known ? '' : 'FASHN credit header was missing',
      }], session ? { session } : undefined);
      await tie(TryOnJob.updateOne({ _id: job._id }, { usageSettled: true }), session);
      return summary;
    });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function release(job) {
  if (!job || job.cacheHit || job.usageSettled) return null;
  try {
    return await withTransaction(async (session) => {
      const summary = await tie(TryOnUserSummary.findOne({ userId: job.userId }), session);
      if (!summary) return null;
      const bucket = job.customerBucket === 'PAID' ? 'PAID' : 'FREE';
      if (bucket === 'PAID') {
        summary.paidReserved = Math.max(0, summary.paidReserved - 1);
        summary.paidRemaining += 1;
      } else {
        summary.freeReserved = Math.max(0, summary.freeReserved - 1);
        summary.freeRemaining += 1;
      }
      summary.tryOnsFailed += 1;
      applyCost(summary, await configRate());
      await summary.save(session ? { session } : undefined);
      await TryOnLedger.create([{
        userId: job.userId,
        jobId: job._id,
        type: 'release',
        bucket,
        tryOns: 1,
        fashnCredits: 0,
        note: 'Failed try-on returned to the wallet',
      }], session ? { session } : undefined);
      await tie(TryOnJob.updateOne({ _id: job._id }, {
        usageSettled: true,
        fashnCreditsUsed: 0,
        fashnCreditsKnown: true,
        creditsUsed: 0,
      }), session);
      return summary;
    });
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

async function recordCacheHit({ user, job }) {
  return withTransaction(async (session) => {
    const summary = await ensureSummary(user, session);
    summary.cacheHits += 1;
    summary.lastTryOnAt = new Date();
    if (!summary.firstTryOnAt) summary.firstTryOnAt = summary.lastTryOnAt;
    applyCost(summary, await configRate());
    await summary.save(session ? { session } : undefined);
    if (job?._id) {
      await TryOnLedger.create([{
        userId: user._id,
        jobId: job._id,
        type: 'cache_hit',
        bucket: 'NONE',
        tryOns: 0,
        fashnCredits: 0,
        note: 'Same photo and saree. No new generation.',
      }], session ? { session } : undefined);
    }
    return summary;
  });
}

async function recordPurchase({ userId, tryOns, amountPaise, note }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'User not found.');
  const count = Math.max(0, Number(tryOns) || 0);
  const paise = Math.max(0, Math.round(Number(amountPaise) || 0));
  return withTransaction(async (session) => {
    const summary = await ensureSummary(user, session);
    summary.paidPurchased += count;
    summary.paidRemaining += count;
    summary.moneyPaidPaise += paise;
    summary.paymentCount += 1;
    summary.moneyNetPaise = summary.moneyPaidPaise - summary.refundPaise;
    applyCost(summary, await configRate());
    await summary.save(session ? { session } : undefined);
    await TryOnLedger.create([{
      userId: user._id,
      type: 'purchase',
      bucket: 'PAID',
      tryOns: count,
      amountPaise: paise,
      note: note || '',
    }], session ? { session } : undefined);
    return presentRow(summary, await getOrCreate());
  });
}

async function recordRefund({ userId, tryOns, amountPaise, note }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'User not found.');
  const count = Math.max(0, Number(tryOns) || 0);
  const paise = Math.max(0, Math.round(Number(amountPaise) || 0));
  return withTransaction(async (session) => {
    const summary = await ensureSummary(user, session);
    summary.paidPurchased = Math.max(0, summary.paidPurchased - count);
    summary.paidRemaining -= count;
    summary.refundPaise += paise;
    summary.refundCount += 1;
    summary.moneyNetPaise = summary.moneyPaidPaise - summary.refundPaise;
    applyCost(summary, await configRate());
    await summary.save(session ? { session } : undefined);
    await TryOnLedger.create([{
      userId: user._id,
      type: 'refund',
      bucket: 'PAID',
      tryOns: count,
      amountPaise: paise,
      note: note || '',
    }], session ? { session } : undefined);
    return presentRow(summary, await getOrCreate());
  });
}

function presentRow(row, config) {
  const rate = rateOf(config);
  return {
    userId: String(row.userId),
    name: row.name || '-',
    phone: row.phone || '-',
    email: row.email || '-',
    joinedAt: row.joinedAt,
    firstTryOnAt: row.firstTryOnAt,
    lastTryOnAt: row.lastTryOnAt,
    tryOnsStarted: row.tryOnsStarted,
    tryOnsCompleted: row.tryOnsCompleted,
    tryOnsFailed: row.tryOnsFailed,
    cacheHits: row.cacheHits,
    freeGranted: row.freeGranted,
    freeUsed: row.freeUsed,
    freeRemaining: row.freeRemaining,
    paidPurchased: row.paidPurchased,
    paidUsed: row.paidUsed,
    paidRemaining: row.paidRemaining,
    moneyPaidPaise: row.moneyPaidPaise,
    moneyPaidInr: inr(row.moneyPaidPaise),
    paymentCount: row.paymentCount,
    refundPaise: row.refundPaise,
    refundInr: inr(row.refundPaise),
    refundCount: row.refundCount,
    moneyNetPaise: row.moneyNetPaise,
    moneyNetInr: inr(row.moneyNetPaise),
    fashnCreditsUsed: row.fashnCreditsUsed,
    fashnCreditsFree: row.fashnCreditsFree,
    fashnCreditsPaid: row.fashnCreditsPaid,
    fashnCreditsUnknown: row.fashnCreditsUnknown,
    fashnCostPaise: rate == null ? null : row.fashnCostPaise,
    fashnCostInr: rate == null ? null : inr(row.fashnCostPaise),
    fashnCostFreeInr: rate == null ? null : inr(row.fashnCostFreePaise),
    fashnCostPaidInr: rate == null ? null : inr(row.fashnCostPaidPaise),
    netMarginPaise: rate == null ? null : row.netMarginPaise,
    netMarginInr: rate == null ? null : inr(row.netMarginPaise),
    marginNegative: rate != null && row.netMarginPaise < 0,
    wallet: { freeRemaining: row.freeRemaining, paidRemaining: row.paidRemaining },
  };
}

function listFilter(query) {
  const filter = {};
  const search = String(query.search || '').trim();
  if (search) {
    if (/^[a-f\d]{24}$/i.test(search)) filter.userId = new mongoose.Types.ObjectId(search);
    else {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { phone: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { name: { $regex: safe, $options: 'i' } },
      ];
    }
  }
  if (query.from || query.to) {
    filter.lastTryOnAt = {};
    if (query.from) filter.lastTryOnAt.$gte = new Date(query.from);
    if (query.to) filter.lastTryOnAt.$lte = new Date(query.to);
  }
  const preset = query.preset || query.view || '';
  if (preset === 'free' || query.onlyFree === 'true') {
    filter.moneyNetPaise = { $lte: 0 };
    filter.paidPurchased = 0;
    filter.freeUsed = { $gt: 0 };
  }
  if (preset === 'paying' || query.onlyPaying === 'true') filter.moneyNetPaise = { $gt: 0 };
  if (preset === 'negative' || query.negativeMargin === 'true') filter.netMarginPaise = { $lt: 0 };
  if (preset === 'never' || query.neverTried === 'true') filter.tryOnsStarted = 0;
  if (preset === 'abuse') {
    filter.freeUsed = { $gt: 0 };
    filter.paidPurchased = 0;
    filter.moneyNetPaise = { $lte: 0 };
  }
  if (preset === 'high' || query.highUsage === 'true') {
    filter.tryOnsCompleted = { $gte: Math.max(1, Number(query.minCompleted) || 10) };
  }
  return filter;
}

function sortSpec(query) {
  const preset = query.preset || query.view || '';
  const key = query.sort || (preset === 'spenders' ? 'revenue' : preset === 'cost' ? 'fashnCredits' : '');
  const field = SORTS[key] || 'lastTryOnAt';
  const direction = query.direction === 'asc' ? 1 : -1;
  return { [field]: direction };
}

async function totalsFor(filter, config) {
  const [row] = await TryOnUserSummary.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        users: { $sum: 1 },
        tryOnsStarted: { $sum: '$tryOnsStarted' },
        tryOnsCompleted: { $sum: '$tryOnsCompleted' },
        tryOnsFailed: { $sum: '$tryOnsFailed' },
        cacheHits: { $sum: '$cacheHits' },
        fashnCreditsUsed: { $sum: '$fashnCreditsUsed' },
        fashnCreditsFree: { $sum: '$fashnCreditsFree' },
        fashnCreditsPaid: { $sum: '$fashnCreditsPaid' },
        fashnCostPaise: { $sum: '$fashnCostPaise' },
        fashnCostFreePaise: { $sum: '$fashnCostFreePaise' },
        moneyNetPaise: { $sum: '$moneyNetPaise' },
        netMarginPaise: { $sum: '$netMarginPaise' },
      },
    },
  ]);
  const rate = rateOf(config);
  const blank = row || {};
  return {
    users: blank.users || 0,
    tryOnsStarted: blank.tryOnsStarted || 0,
    tryOnsCompleted: blank.tryOnsCompleted || 0,
    tryOnsFailed: blank.tryOnsFailed || 0,
    cacheHits: blank.cacheHits || 0,
    fashnCreditsUsed: blank.fashnCreditsUsed || 0,
    fashnCostInr: rate == null ? null : inr(blank.fashnCostPaise || 0),
    freeQuotaCostInr: rate == null ? null : inr(blank.fashnCostFreePaise || 0),
    paidTryOnCostInr: rate == null ? null : inr((blank.fashnCreditsPaid || 0) * rate),
    revenueInr: inr(blank.moneyNetPaise || 0),
    netMarginInr: rate == null ? null : inr(blank.netMarginPaise || 0),
  };
}

async function listUsers(query) {
  const config = await getOrCreate();
  const filter = listFilter(query);
  const skip = (query.page - 1) * query.limit;
  const [rows, total, totals] = await Promise.all([
    TryOnUserSummary.find(filter).sort(sortSpec(query)).skip(skip).limit(query.limit).lean(),
    TryOnUserSummary.countDocuments(filter),
    totalsFor(filter, config),
  ]);
  let groups = [];
  if ((query.preset || query.view) === 'abuse') {
    groups = await abuseGroups();
  }
  return {
    items: rows.map((row) => presentRow(row, config)),
    ...pageMeta(query.page, query.limit, total),
    totals,
    settings: presentSettings(config),
    groups,
  };
}

async function abuseGroups() {
  const rows = await TryOnJob.aggregate([
    { $match: { cacheHit: { $ne: true }, customerBucket: 'FREE', status: 'completed', ip: { $ne: '' } } },
    { $group: { _id: '$ip', users: { $addToSet: '$userId' }, jobs: { $sum: 1 } } },
    { $match: { 'users.1': { $exists: true } } },
    { $sort: { jobs: -1 } },
    { $limit: 50 },
  ]);
  return rows.map((row) => ({
    ip: row._id,
    users: row.users.length,
    jobs: row.jobs,
  }));
}

async function userDetail(userId, query, actor, meta) {
  if (!mongoose.isValidObjectId(userId)) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'User not found.');
  const config = await getOrCreate();
  const summary = await TryOnUserSummary.findOne({ userId }).lean();
  if (!summary) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'This user has no try-on record yet.');
  const [ledger, jobs] = await Promise.all([
    TryOnLedger.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
    TryOnJob.find({ userId }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  const showPhotos = query.photos === 'true' || query.photos === true;
  if (showPhotos) {
    await recordAudit({
      action: 'TRYON_PHOTO_VIEW',
      resource: 'tryon-user',
      resourceId: String(userId),
      description: `Viewed try-on photos for ${summary.name || userId}`,
      actorId: actor?.id || String(actor?._id || ''),
      actorName: actor?.name || 'Admin',
      ip: meta?.ip || '',
      userAgent: meta?.userAgent || '',
    });
  }
  const disk = storage();
  const presentedJobs = await Promise.all(jobs.map(async (job) => {
    let thumbnail = null;
    if (showPhotos && job.outputKey && !job.cacheHit) thumbnail = await disk.signedUrl(job.outputKey);
    return {
      id: String(job._id),
      status: job.status,
      model: job.providerModel,
      parameters: job.parameters || null,
      customerBucket: job.customerBucket || 'UNKNOWN',
      cacheHit: Boolean(job.cacheHit),
      fashnCreditsUsed: job.fashnCreditsKnown ? job.fashnCreditsUsed : null,
      fashnCreditsKnown: job.fashnCreditsKnown === true,
      createdAt: job.createdAt,
      completedAt: job.completedAt || null,
      ip: job.ip || '',
      thumbnail,
    };
  }));
  const payments = ledger
    .filter((entry) => entry.type === 'purchase' || entry.type === 'refund')
    .map((entry) => ({
      id: String(entry._id),
      type: entry.type,
      tryOns: entry.tryOns,
      amountInr: inr(entry.amountPaise),
      note: entry.note,
      createdAt: entry.createdAt,
    }));
  return {
    summary: presentRow(summary, config),
    settings: presentSettings(config),
    ledger: ledger.map((entry) => ({
      id: String(entry._id),
      type: entry.type,
      bucket: entry.bucket,
      tryOns: entry.tryOns,
      fashnCredits: entry.fashnCredits,
      amountInr: inr(entry.amountPaise),
      note: entry.note,
      jobId: entry.jobId ? String(entry.jobId) : null,
      createdAt: entry.createdAt,
    })),
    payments,
    jobs: presentedJobs,
  };
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

async function exportCsv(query, actor, meta) {
  const config = await getOrCreate();
  const filter = listFilter({ ...query, page: 1, limit: 20 });
  const rows = await TryOnUserSummary.find(filter).sort(sortSpec(query)).limit(20000).lean();
  await recordAudit({
    action: 'TRYON_USAGE_EXPORT',
    resource: 'tryon-usage',
    resourceId: '',
    description: `Exported ${rows.length} try-on usage rows`,
    after: { from: query.from || '', to: query.to || '', preset: query.preset || '' },
    actorId: actor?.id || String(actor?._id || ''),
    actorName: actor?.name || 'Admin',
    ip: meta?.ip || '',
    userAgent: meta?.userAgent || '',
  });
  const rate = rateOf(config);
  const header = [
    `# Tripuraa try-on usage`,
    `# from=${query.from || ''}`,
    `# to=${query.to || ''}`,
    `# preset=${query.preset || query.view || ''}`,
    `# rupees_per_credit=${rate == null ? 'not-set' : (rate / 100).toFixed(2)}`,
    `# rate_as_of=${config.fashnRateAsOf ? new Date(config.fashnRateAsOf).toISOString() : ''}`,
    `# money_net_inr = (money_paid_paise - refund_paise) / 100`,
    `# fashn_cost_inr = fashn_credits_used * rupees_per_credit`,
    `# net_margin_inr = money_net_inr - fashn_cost_inr`,
  ];
  const columns = [
    'userId', 'name', 'phone', 'email', 'joinedAt', 'firstTryOnAt', 'lastTryOnAt',
    'tryOnsStarted', 'tryOnsCompleted', 'tryOnsFailed', 'cacheHits',
    'freeGranted', 'freeUsed', 'freeRemaining', 'paidPurchased', 'paidUsed', 'paidRemaining',
    'moneyPaidInr', 'paymentCount', 'refundInr', 'moneyNetInr',
    'fashnCreditsUsed', 'fashnCreditsFree', 'fashnCreditsPaid', 'fashnCreditsUnknown',
    'fashnCostFreeInr', 'fashnCostPaidInr', 'fashnCostInr', 'netMarginInr',
  ];
  const lines = rows.map((row) => {
    const presented = presentRow(row, config);
    return columns.map((key) => csvCell(presented[key] instanceof Date ? presented[key].toISOString() : presented[key])).join(',');
  });
  return [...header, columns.join(','), ...lines].join('\n');
}

function presentSettings(config) {
  const rate = rateOf(config);
  return {
    rupeesPerCredit: rate == null ? null : rate / 100,
    rupeesPerCreditPaise: rate,
    asOf: config.fashnRateAsOf || null,
    rateConfigured: rate != null,
    freeTryOnQuota: Number.isFinite(config.freeTryOnQuota) ? config.freeTryOnQuota : 3,
    paidTryOnPriceInr: (Number.isFinite(config.paidTryOnPricePaise) ? config.paidTryOnPricePaise : 2000) / 100,
    chargeEnforced: config.tryOnChargeEnforced === true,
  };
}

async function getSettings() {
  return presentSettings(await getOrCreate());
}

async function updateSettings(input, actor, meta) {
  const reason = String(input.reason || '').trim();
  if (reason.length < 3) throw new ApiError(400, 'REASON_REQUIRED', 'A reason is required to change the try-on rate.');
  const config = await getOrCreate();
  const before = presentSettings(config);
  if (input.rupeesPerCredit != null) {
    const rupees = Number(input.rupeesPerCredit);
    if (!Number.isFinite(rupees) || rupees < 0 || rupees > 10000) {
      throw new ApiError(400, 'INVALID_RATE', 'Rupees per credit must be a number from 0 to 10000.');
    }
    config.fashnRupeesPerCreditPaise = Math.round(rupees * 100);
    config.fashnRateAsOf = input.asOf ? new Date(input.asOf) : new Date();
  }
  if (input.freeTryOnQuota != null) config.freeTryOnQuota = input.freeTryOnQuota;
  if (input.paidTryOnPriceInr != null) config.paidTryOnPricePaise = Math.round(Number(input.paidTryOnPriceInr) * 100);
  if (input.chargeEnforced != null) config.tryOnChargeEnforced = Boolean(input.chargeEnforced);
  config.updatedBy = actor?.name || 'Admin';
  await config.save();
  const rate = rateOf(config);
  if (rate != null) {
    await TryOnUserSummary.updateMany({}, [{
      $set: {
        fashnCostPaise: { $multiply: ['$fashnCreditsUsed', rate] },
        fashnCostFreePaise: { $multiply: ['$fashnCreditsFree', rate] },
        fashnCostPaidPaise: { $multiply: ['$fashnCreditsPaid', rate] },
        netMarginPaise: { $subtract: ['$moneyNetPaise', { $multiply: ['$fashnCreditsUsed', rate] }] },
      },
    }], { updatePipeline: true });
  }
  const after = presentSettings(config);
  await recordAudit({
    action: 'TRYON_RATE_UPDATE',
    resource: 'tryon-settings',
    resourceId: 'system',
    before,
    after,
    description: reason,
    actorId: actor?.id || String(actor?._id || ''),
    actorName: actor?.name || 'Admin',
    ip: meta?.ip || '',
    userAgent: meta?.userAgent || '',
  });
  return after;
}

function ledgerTotals(entries) {
  const totals = {
    freeGranted: 0,
    freeUsed: 0,
    freeRemaining: 0,
    paidPurchased: 0,
    paidUsed: 0,
    paidRemaining: 0,
    moneyPaidPaise: 0,
    refundPaise: 0,
    fashnCreditsUsed: 0,
    tryOnsCompleted: 0,
    tryOnsFailed: 0,
    cacheHits: 0,
    tryOnsStarted: 0,
  };
  entries.forEach((entry) => {
    if (entry.type === 'grant' && entry.bucket === 'FREE') {
      totals.freeGranted += entry.tryOns;
      totals.freeRemaining += entry.tryOns;
    }
    if (entry.type === 'reserve') {
      totals.tryOnsStarted += entry.tryOns;
      if (entry.bucket === 'PAID') totals.paidRemaining -= entry.tryOns;
      else totals.freeRemaining -= entry.tryOns;
    }
    if (entry.type === 'consume') {
      totals.tryOnsCompleted += entry.tryOns;
      totals.fashnCreditsUsed += entry.fashnCredits || 0;
      if (entry.bucket === 'PAID') totals.paidUsed += entry.tryOns;
      else totals.freeUsed += entry.tryOns;
    }
    if (entry.type === 'release') {
      totals.tryOnsFailed += entry.tryOns;
      if (entry.bucket === 'PAID') totals.paidRemaining += entry.tryOns;
      else totals.freeRemaining += entry.tryOns;
    }
    if (entry.type === 'purchase') {
      totals.paidPurchased += entry.tryOns;
      totals.paidRemaining += entry.tryOns;
      totals.moneyPaidPaise += entry.amountPaise || 0;
    }
    if (entry.type === 'refund') {
      totals.paidPurchased -= entry.tryOns;
      totals.paidRemaining -= entry.tryOns;
      totals.refundPaise += entry.amountPaise || 0;
    }
    if (entry.type === 'cache_hit') totals.cacheHits += 1;
  });
  return totals;
}

async function reconcile(options = {}) {
  await TryOnJob.updateMany(
    { fashnCreditsKnown: { $exists: false } },
    { $set: { fashnCreditsKnown: false, customerBucket: 'UNKNOWN', cacheHit: false } },
  );
  const users = await User.find({ deletedAt: null }).select('fullName phone email createdAt').lean();
  for (const user of users) {
    const exists = await TryOnUserSummary.exists({ userId: user._id });
    if (!exists) await openWallet(user);
  }
  const grouped = await TryOnLedger.aggregate([
    { $group: { _id: '$userId', entries: { $push: '$$ROOT' } } },
  ]);
  const mismatches = [];
  for (const group of grouped) {
    const expected = ledgerTotals(group.entries);
    const summary = await TryOnUserSummary.findOne({ userId: group._id }).lean();
    if (!summary) {
      mismatches.push({ userId: String(group._id), field: 'summary', expected: 'present', actual: 'missing' });
      continue;
    }
    ['freeGranted', 'freeUsed', 'freeRemaining', 'paidPurchased', 'paidUsed', 'moneyPaidPaise', 'refundPaise', 'fashnCreditsUsed', 'tryOnsCompleted', 'tryOnsFailed', 'cacheHits']
      .forEach((field) => {
        if ((summary[field] || 0) !== (expected[field] || 0)) {
          mismatches.push({
            userId: String(group._id),
            field,
            expected: expected[field] || 0,
            actual: summary[field] || 0,
          });
        }
      });
    if (options.repair && mismatches.some((item) => item.userId === String(group._id))) {
      await TryOnUserSummary.updateOne({ userId: group._id }, { $set: expected });
    }
  }
  return { checked: grouped.length, mismatches, repaired: Boolean(options.repair) };
}

function startReconcileSchedule() {
  const day = 24 * 60 * 60 * 1000;
  setInterval(() => {
    reconcile({ repair: false }).catch(() => null);
  }, day);
}

async function customerWallet(user) {
  let summary = await TryOnUserSummary.findOne({ userId: user._id }).lean();
  if (!summary) summary = await openWallet(user);
  const config = await getOrCreate();
  const pricePaise = Number.isFinite(config.paidTryOnPricePaise) ? config.paidTryOnPricePaise : 2000;
  return {
    freeGranted: summary.freeGranted || 0,
    freeUsed: summary.freeUsed || 0,
    freeRemaining: summary.freeRemaining || 0,
    paidPurchased: summary.paidPurchased || 0,
    paidUsed: summary.paidUsed || 0,
    paidRemaining: summary.paidRemaining || 0,
    paidTryOnPriceInr: pricePaise / 100,
    chargeEnforced: config.tryOnChargeEnforced === true,
  };
}

async function explainList(query) {
  const filter = listFilter(query);
  return TryOnUserSummary.find(filter).sort(sortSpec(query)).limit(query.limit || 20).explain('executionStats');
}

module.exports = {
  openWallet,
  reserve,
  consume,
  release,
  recordCacheHit,
  recordPurchase,
  recordRefund,
  listUsers,
  userDetail,
  exportCsv,
  getSettings,
  updateSettings,
  reconcile,
  startReconcileSchedule,
  explainList,
  customerWallet,
  presentRow,
  inr,
};
