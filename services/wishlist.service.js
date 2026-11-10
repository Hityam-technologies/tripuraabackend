const { ApiError } = require('../utils/ApiError');
const { presentSaree } = require('../utils/presenters');
const Wishlist = require('../models/Wishlist');
const Saree = require('../models/Saree');

async function listWishlist(userId) {
  const rows = await Wishlist.find({ userId }).sort({ createdAt: -1 }).lean();
  const sarees = await Saree.find({ id: { $in: rows.map((row) => row.sareeId) }, deletedAt: null, isActive: true }).lean();
  const byId = new Map(sarees.map((saree) => [saree.id, saree]));
  const items = rows.filter((row) => byId.has(row.sareeId)).map((row) => presentSaree(byId.get(row.sareeId)));
  return { ids: items.map((item) => item.id), items };
}

async function addWishlist(userId, sareeId) {
  const saree = await Saree.findOne({ id: sareeId, isActive: true, deletedAt: null });
  if (!saree) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${sareeId}' was not found.`);
  await Wishlist.updateOne({ userId, sareeId }, { $setOnInsert: { userId, sareeId } }, { upsert: true });
  return { sareeId, saved: true };
}

async function removeWishlist(userId, sareeId) {
  const result = await Wishlist.deleteMany({ userId, sareeId });
  return { sareeId, saved: false, removed: result.deletedCount > 0 };
}

module.exports = { listWishlist, addWishlist, removeWishlist };
