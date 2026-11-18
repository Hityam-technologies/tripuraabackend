const { ApiError } = require('../utils/ApiError');
const { pageMeta } = require('../utils/pagination');
const { recordAudit } = require('./audit.service');
const User = require('../models/User');
const Referral = require('../models/Referral');
const ReferralProgram = require('../models/ReferralProgram');
const WalletTransaction = require('../models/WalletTransaction');
const ShopOrder = require('../models/ShopOrder');

const SHARE_BASE = 'https://tripuraa.com';

function tie(query, session) {
  return session ? query.session(session) : query;
}

function rupees(value) {
  const amount = Math.round(Number(value) || 0);
  return amount > 0 ? amount : 0;
}

function presentProgram(doc) {
  return {
    enabled: doc?.enabled !== false,
    refereeSignupBonus: rupees(doc?.refereeSignupBonus ?? 500),
    referrerOrderReward: rupees(doc?.referrerOrderReward ?? 500),
    shareBaseUrl: SHARE_BASE,
  };
}

function formatDisplayName(fullName) {
  const names = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!names.length) return 'Tripuraa Member';
  if (names.length === 1) return names[0];
  return `${names[0]} ${names[names.length - 1].charAt(0).toUpperCase()}.`;
}

function nameStem(fullName) {
  const letters = String(fullName || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  const stem = letters.slice(0, 7);
  return stem.length >= 3 ? stem : 'TRIPURA';
}

function istDayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function friendlyDate(date) {
  const when = new Date(date);
  const key = istDayKey(when);
  const today = istDayKey(new Date());
  const yesterday = istDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return when.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function statusLabel(status) {
  return { PENDING: 'Pending', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }[status] || status;
}

function moneyLabel(amount) {
  return `+₹${rupees(amount).toLocaleString('en-IN')}`;
}

async function getProgram() {
  const doc = await ReferralProgram.findOneAndUpdate(
    { singleton: 'referral' },
    { $setOnInsert: { singleton: 'referral', enabled: true, refereeSignupBonus: 500, referrerOrderReward: 500 } },
    { upsert: true, returnDocument: 'after' },
  );
  return doc;
}

async function saveProgram(input, actor, meta) {
  const before = presentProgram(await getProgram());
  const doc = await ReferralProgram.findOneAndUpdate(
    { singleton: 'referral' },
    {
      $set: {
        enabled: input.enabled,
        refereeSignupBonus: rupees(input.refereeSignupBonus),
        referrerOrderReward: rupees(input.referrerOrderReward),
      },
    },
    { upsert: true, returnDocument: 'after' },
  );
  const after = presentProgram(doc);
  await recordAudit({
    action: 'REFERRAL_SETTINGS',
    resource: 'referral-program',
    resourceId: 'referral',
    before,
    after,
    description: after.enabled
      ? `Referral cash set to ₹${after.refereeSignupBonus} on signup and ₹${after.referrerOrderReward} on the first order`
      : 'Referral rewards turned off',
    actorId: actor?.id || '',
    actorName: actor?.name || 'Admin',
    ip: meta?.ip || '',
    userAgent: meta?.userAgent || '',
  });
  return after;
}

async function generateUniqueReferralCode(fullName) {
  const stem = nameStem(fullName);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = `${stem}${Math.floor(1000 + Math.random() * 9000)}`;
    const taken = await User.exists({ referralCode: code });
    if (!taken) return code;
  }
  return `${stem}${Date.now().toString().slice(-6)}`;
}

async function ensureReferralCode(user) {
  if (!user || user.referralCode) return user?.referralCode || '';
  user.referralCode = await generateUniqueReferralCode(user.fullName);
  try {
    await user.save();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    user.referralCode = await generateUniqueReferralCode(`${user.fullName || 'Tripura'}${Date.now()}`);
    await user.save();
  }
  return user.referralCode;
}

async function findActiveReferrer(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(normalized)) return null;
  return User.findOne({
    referralCode: normalized,
    deletedAt: null,
    isBlocked: false,
    isEmailVerified: true,
  });
}

async function validateCode(code) {
  const program = presentProgram(await getProgram());
  if (!program.enabled) {
    throw new ApiError(400, 'REFERRAL_PAUSED', 'Referral rewards are paused right now.');
  }
  const referrer = await findActiveReferrer(code);
  if (!referrer) {
    throw new ApiError(404, 'INVALID_REFERRAL', 'Invalid referral code. Please check and try again.');
  }
  return {
    valid: true,
    code: referrer.referralCode,
    referrerName: formatDisplayName(referrer.fullName),
    instantCash: program.refereeSignupBonus,
  };
}

async function creditWallet({ userId, amount, source, orderId, description, session }) {
  const amountRupees = rupees(amount);
  if (amountRupees <= 0) return false;
  try {
    await WalletTransaction.create([{
      userId,
      amount: amountRupees,
      type: 'CREDIT',
      source,
      orderId: orderId || null,
      description,
    }], session ? { session } : undefined);
  } catch (error) {
    if (error?.code === 11000) return false;
    throw error;
  }
  try {
    await User.updateOne(
      { _id: userId },
      { $inc: { walletBalance: amountRupees } },
      session ? { session } : undefined,
    );
  } catch (error) {
    if (!session) {
      await WalletTransaction.deleteOne({ userId, source, orderId: orderId || null });
    }
    throw error;
  }
  return true;
}

async function rememberReferral(user, referralRow) {
  user.pendingReferralCode = '';
  user.referredById = referralRow.referrerId;
  const alreadyPaid = await WalletTransaction.exists({
    userId: user._id,
    source: 'REFERRAL_SIGNUP_BONUS',
  });
  if (!alreadyPaid) {
    await creditWallet({
      userId: user._id,
      amount: referralRow.refereeInstantReward,
      source: 'REFERRAL_SIGNUP_BONUS',
      description: `Instant welcome cash for joining with code ${referralRow.referralCode}`,
    });
  }
  const fresh = await User.findById(user._id).select('walletBalance');
  if (fresh) user.walletBalance = fresh.walletBalance;
  await user.save();
  return user;
}

async function grantSignupBonus(user, fallbackCode) {
  const already = await Referral.findOne({ refereeId: user._id });
  if (already) return rememberReferral(user, already);
  const chosen = String(user.pendingReferralCode || fallbackCode || '').trim().toUpperCase();
  if (!chosen || !user.isEmailVerified) return user;
  const program = presentProgram(await getProgram());
  const referrer = await findActiveReferrer(chosen);
  user.pendingReferralCode = '';
  if (!program.enabled || !referrer || String(referrer._id) === String(user._id)) {
    await user.save();
    return user;
  }
  let referralRow;
  try {
    referralRow = await Referral.create({
      referrerId: referrer._id,
      refereeId: user._id,
      referralCode: referrer.referralCode,
      status: 'PENDING',
      refereeInstantReward: program.refereeSignupBonus,
      referrerReward: program.referrerOrderReward,
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    referralRow = await Referral.findOne({ refereeId: user._id });
  }
  if (!referralRow) {
    await user.save();
    return user;
  }
  return rememberReferral(user, referralRow);
}

async function maybeCompleteReferral({ userId, orderId, session }) {
  const program = presentProgram(await getProgram());
  if (!program.enabled) return null;
  const earlier = await tie(ShopOrder.countDocuments({
    userId,
    status: { $ne: 'CANCELLED' },
    _id: { $ne: orderId },
  }), session);
  // Only the first live order pays the friend. A cancelled order does not count.
  if (earlier > 0) return null;
  const options = { returnDocument: 'after' };
  if (session) options.session = session;
  const referral = await Referral.findOneAndUpdate(
    { refereeId: userId, status: 'PENDING' },
    { $set: { status: 'COMPLETED', firstOrderId: orderId, completedAt: new Date() } },
    options,
  );
  if (!referral) return null;
  try {
    await creditWallet({
      userId: referral.referrerId,
      amount: referral.referrerReward,
      source: 'REFERRER_FIRST_ORDER_REWARD',
      orderId,
      description: 'Referral cash reward. Your friend placed their first order.',
      session,
    });
  } catch (error) {
    if (!session) {
      await Referral.updateOne(
        { _id: referral._id, status: 'COMPLETED', firstOrderId: orderId },
        { $set: { status: 'PENDING', firstOrderId: null, completedAt: null } },
      );
    }
    throw error;
  }
  return referral;
}

async function reverseForCancelledOrder(order, session) {
  const spent = rupees(order.walletAmount);
  if (spent > 0 && !order.walletRefunded) {
    await User.updateOne(
      { _id: order.userId },
      { $inc: { walletBalance: spent } },
      session ? { session } : undefined,
    );
    await WalletTransaction.create([{
      userId: order.userId,
      amount: spent,
      type: 'CREDIT',
      source: 'ORDER_REFUND',
      orderId: order._id,
      description: `Store cash returned because order ${order.orderNumber} was cancelled`,
    }], session ? { session } : undefined);
    order.walletRefunded = true;
  }

  const options = { returnDocument: 'after' };
  if (session) options.session = session;
  const referral = await Referral.findOneAndUpdate(
    { refereeId: order.userId, firstOrderId: order._id, status: 'COMPLETED' },
    { $set: { status: 'CANCELLED' } },
    options,
  );
  if (!referral) return null;
  const reward = rupees(referral.referrerReward);
  const referrer = await tie(User.findById(referral.referrerId), session);
  let clawback = Math.min(reward, rupees(referrer?.walletBalance));
  if (clawback > 0) {
    const debited = await User.findOneAndUpdate(
      { _id: referral.referrerId, walletBalance: { $gte: clawback } },
      { $inc: { walletBalance: -clawback } },
      { returnDocument: 'after', ...(session ? { session } : {}) },
    );
    if (!debited) clawback = 0;
  }
  if (clawback > 0) {
    await WalletTransaction.create([{
      userId: referral.referrerId,
      amount: -clawback,
      type: 'DEBIT',
      source: 'REFERRER_REWARD_REVERSED',
      orderId: order._id,
      description: 'Referral reward taken back because the first order was cancelled',
    }], session ? { session } : undefined);
  }
  // The full reward came back, so the friend can earn it on the next real first order.
  if (clawback === reward) {
    referral.status = 'PENDING';
    referral.firstOrderId = null;
    referral.completedAt = null;
    await referral.save(session ? { session } : undefined);
  }
  return referral;
}

async function myDashboard(user) {
  await ensureReferralCode(user);
  const program = presentProgram(await getProgram());
  const rows = await Referral.find({ referrerId: user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('refereeId', 'fullName');
  const totalRewards = rows
    .filter((row) => row.status === 'COMPLETED')
    .reduce((sum, row) => sum + rupees(row.referrerReward), 0);
  const code = user.referralCode;
  const bonus = program.refereeSignupBonus;
  return {
    referralCode: code,
    walletBalance: rupees(user.walletBalance),
    totalRewards,
    refereeSignupBonus: bonus,
    referrerOrderReward: program.referrerOrderReward,
    enabled: program.enabled,
    shareLink: `${SHARE_BASE}/invite/${code}`,
    shareMessage: `Shop handcrafted pure silk handloom sarees at Tripuraa Sangrahah! Use my referral code ${code} to get ₹${bonus.toLocaleString('en-IN')} instant cash on signup: ${SHARE_BASE}`,
    referrals: rows.map((row) => ({
      id: String(row._id),
      name: formatDisplayName(row.refereeId?.fullName),
      date: friendlyDate(row.createdAt),
      points: row.status === 'CANCELLED' ? '+₹0' : moneyLabel(row.referrerReward),
      status: statusLabel(row.status),
    })),
  };
}

function personName(person) {
  if (!person) return 'Deleted customer';
  return person.fullName || 'Customer';
}

async function adminList(query) {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.search) {
    const term = String(query.search).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const people = await User.find({
      $or: ['fullName', 'email', 'phone', 'referralCode'].map((field) => ({ [field]: new RegExp(term, 'i') })),
    }).select('_id').limit(40);
    const ids = people.map((row) => row._id);
    filter.$or = [
      { referralCode: new RegExp(`^${term}`, 'i') },
      { referrerId: { $in: ids } },
      { refereeId: { $in: ids } },
    ];
  }
  const [rows, total] = await Promise.all([
    Referral.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('referrerId', 'fullName email phone referralCode')
      .populate('refereeId', 'fullName email phone'),
    Referral.countDocuments(filter),
  ]);
  return {
    items: rows.map((row) => ({
      id: String(row._id),
      status: row.status,
      statusLabel: statusLabel(row.status),
      referralCode: row.referralCode,
      refereeSignupBonus: rupees(row.refereeInstantReward),
      referrerReward: rupees(row.referrerReward),
      referrer: {
        id: row.referrerId?._id ? String(row.referrerId._id) : '',
        name: personName(row.referrerId),
        email: row.referrerId?.email || '',
        code: row.referrerId?.referralCode || row.referralCode,
      },
      referee: {
        id: row.refereeId?._id ? String(row.refereeId._id) : '',
        name: personName(row.refereeId),
        email: row.refereeId?.email || '',
        phone: row.refereeId?.phone || '',
      },
      firstOrderId: row.firstOrderId ? String(row.firstOrderId) : '',
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    })),
    ...pageMeta(page, limit, total),
  };
}

module.exports = {
  getProgram,
  presentProgram,
  saveProgram,
  generateUniqueReferralCode,
  ensureReferralCode,
  findActiveReferrer,
  validateCode,
  grantSignupBonus,
  maybeCompleteReferral,
  reverseForCancelledOrder,
  myDashboard,
  adminList,
};
