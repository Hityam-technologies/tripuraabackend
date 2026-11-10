const { ApiError } = require('../utils/ApiError');
const { pageMeta } = require('../utils/pagination');
const { publicUser } = require('./auth.service');
const { presentSaree } = require('../utils/presenters');
const { hashPassword, verifyPassword } = require('./auth.service');
const { revokeAll } = require('./token.service');
const { storage } = require('./storage');
const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const DrapeProfile = require('../models/DrapeProfile');
const TryOnJob = require('../models/TryOnJob');
const SavedTryOnLook = require('../models/SavedTryOnLook');
const Enquiry = require('../models/Enquiry');
const Saree = require('../models/Saree');

async function getMe(user) {
  return publicUser(user);
}

async function updateMe(user, patch) {
  if (patch.fullName) user.fullName = patch.fullName;
  if (patch.phone) {
    const clash = await User.findOne({ phone: patch.phone, _id: { $ne: user._id }, deletedAt: null });
    if (clash) throw new ApiError(409, 'PHONE_IN_USE', 'That phone number is already in use.');
    user.phone = patch.phone;
  }
  if (patch.avatarUrl != null) user.avatarUrl = patch.avatarUrl;
  await user.save();
  return publicUser(user);
}

async function changeOwnPassword(user, currentPassword, newPassword) {
  const full = await User.findById(user._id).select('+passwordHash');
  const ok = await verifyPassword(full.passwordHash, currentPassword);
  if (!ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  full.passwordHash = await hashPassword(newPassword);
  await full.save();
  await revokeAll(user._id, 'user');
}

async function deleteMe(user) {
  const profiles = await DrapeProfile.find({ userId: user._id });
  const jobs = await TryOnJob.find({ userId: user._id });
  const disk = storage();
  await Promise.all([
    ...profiles.map((profile) => disk.delete(profile.imageKey).catch(() => null)),
    ...jobs.filter((job) => job.outputKey).map((job) => disk.delete(job.outputKey).catch(() => null)),
  ]);
  await DrapeProfile.deleteMany({ userId: user._id });
  await SavedTryOnLook.deleteMany({ userId: user._id });
  await Wishlist.deleteMany({ userId: user._id });
  await revokeAll(user._id, 'user');
  user.deletedAt = new Date();
  user.isBlocked = true;
  user.email = `deleted-${user._id}@deleted.local`;
  user.phone = `deleted-${user._id}`;
  user.fullName = 'Deleted user';
  user.avatarUrl = '';
  await user.save();
}

async function currentWishlist(userIds) {
  const rows = await Wishlist.find({ userId: { $in: userIds } }).sort({ createdAt: -1 }).lean();
  const sarees = await Saree.find({
    id: { $in: [...new Set(rows.map((row) => row.sareeId))] },
    deletedAt: null,
    isActive: true,
  }).lean();
  const byId = new Map(sarees.map((saree) => [saree.id, saree]));
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.userId}:${row.sareeId}`;
    if (seen.has(key) || !byId.has(row.sareeId)) return false;
    seen.add(key);
    return true;
  }).map((row) => ({ ...row, saree: byId.get(row.sareeId) }));
}

async function adminList(query) {
  const filter = { deletedAt: null };
  if (query.status === 'blocked') filter.isBlocked = true;
  if (query.status === 'active') filter.isBlocked = false;
  if (query.search) {
    const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['fullName', 'email', 'phone'].map((field) => ({ [field]: { $regex: term, $options: 'i' } }));
  }
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    User.countDocuments(filter),
  ]);
  const ids = rows.map((row) => row._id);
  const [wishRows, lookCounts] = await Promise.all([
    currentWishlist(ids),
    SavedTryOnLook.aggregate([
      { $match: { userId: { $in: ids }, removedByAdmin: false } },
      { $group: { _id: { userId: '$userId', sareeId: '$sareeId' } } },
      { $group: { _id: '$_id.userId', count: { $sum: 1 } } },
    ]),
  ]);
  const wishes = new Map();
  wishRows.forEach((row) => {
    const key = String(row.userId);
    wishes.set(key, (wishes.get(key) || 0) + 1);
  });
  const looks = new Map(lookCounts.map((row) => [String(row._id), row.count]));
  return {
    items: rows.map((row) => ({
      ...publicUser(row),
      wishlistCount: wishes.get(String(row._id)) || 0,
      savedLooksCount: looks.get(String(row._id)) || 0,
    })),
    ...pageMeta(query.page, query.limit, total),
  };
}

async function adminGet(id) {
  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Customer not found.');
  const [wishlist, looks, enquiries] = await Promise.all([
    currentWishlist([user._id]),
    SavedTryOnLook.find({ userId: user._id, removedByAdmin: false }).lean(),
    Enquiry.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const seenLooks = new Set();
  const currentLooks = looks.filter((item) => {
    if (seenLooks.has(item.sareeId)) return false;
    seenLooks.add(item.sareeId);
    return true;
  });
  const sareeIds = [...new Set([...currentLooks.map((item) => item.sareeId), ...enquiries.map((item) => item.sareeId)])];
  const sarees = await Saree.find({ id: { $in: sareeIds } }).lean();
  const byId = new Map(sarees.map((saree) => [saree.id, saree]));
  const wishlistSarees = wishlist.map((item) => presentSaree(item.saree));
  const userLooks = currentLooks.map((item) => {
    const saree = byId.get(item.sareeId);
    const presented = saree ? presentSaree(saree) : null;
    return {
      id: String(item._id),
      sareeId: item.sareeId,
      title: presented?.title || '',
      sareeTitle: presented?.title || '',
      price: presented?.price || '',
      image: presented?.image || '',
      drapeImage: presented?.image || '',
      isFlagged: item.isFlagged,
    };
  });
  return {
    ...publicUser(user),
    blockedReason: user.blockedReason || '',
    blockReason: user.blockedReason || '',
    wishlistCount: wishlistSarees.length,
    savedLooksCount: userLooks.length,
    wishlistSarees,
    userLooks,
    wishlist: wishlistSarees.map((item) => ({ sareeId: item.id, title: item.title })),
    looks: userLooks.map((item) => ({
      id: item.id,
      sareeId: item.sareeId,
      title: item.title,
      isFlagged: item.isFlagged,
    })),
    enquiries: enquiries.map((item) => ({
      id: String(item._id),
      sareeId: item.sareeId,
      title: byId.get(item.sareeId)?.title || '',
      status: item.status,
    })),
  };
}

async function setBlocked(id, isBlocked, reason) {
  const user = await User.findOne({ _id: id, deletedAt: null });
  if (!user) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Customer not found.');
  const before = { isBlocked: user.isBlocked, blockedReason: user.blockedReason };
  user.isBlocked = isBlocked;
  user.blockedReason = isBlocked ? (reason || 'Blocked by admin') : '';
  await user.save();
  if (isBlocked) await revokeAll(user._id, 'user');
  return { before, after: publicUser(user) };
}

module.exports = { getMe, updateMe, changeOwnPassword, deleteMe, adminList, adminGet, setBlocked };
