const User = require('../models/User');
const Saree = require('../models/Saree');
const Enquiry = require('../models/Enquiry');
const SavedTryOnLook = require('../models/SavedTryOnLook');
const TryOnJob = require('../models/TryOnJob');
const Category = require('../models/Category');
const { presentSaree } = require('../utils/presenters');
const { creditsSummary, adminJobs } = require('./tryon/tryOn.service');

async function stats() {
  const [totalUsers, totalSarees, openEnquiries, savedLooks, lowStock, categories] = await Promise.all([
    User.countDocuments({ deletedAt: null }),
    Saree.countDocuments({ deletedAt: null }),
    Enquiry.countDocuments({ status: { $in: ['new', 'contacted'] } }),
    SavedTryOnLook.countDocuments({ removedByAdmin: false }),
    Saree.find({ deletedAt: null, stockQuantity: { $lte: 2 } }).sort({ stockQuantity: 1 }).limit(8).lean(),
    Category.find().sort({ sortOrder: 1 }).lean(),
  ]);
  const monthlyTrends = [];
  const now = new Date();
  for (let index = 0; index < 6; index += 1) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index) + 1, 1));
    const [enquiries, conversions, looks, wishes] = await Promise.all([
      Enquiry.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Enquiry.countDocuments({ status: 'confirmed', createdAt: { $gte: start, $lt: end } }),
      SavedTryOnLook.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      require('../models/Wishlist').countDocuments({ createdAt: { $gte: start, $lt: end } }),
    ]);
    const month = start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    monthlyTrends.push({ month, enquiries, conversions, tryOnLooks: looks, wishlistSaves: wishes });
  }
  const categoryBreakdown = [];
  for (const category of categories) {
    const matching = await Saree.find({ category: category.id, deletedAt: null }).select('price').lean();
    categoryBreakdown.push({
      category: category.label,
      count: matching.length,
      value: matching.reduce((sum, saree) => sum + (saree.price || 0), 0),
    });
  }
  const tryOn = await adminJobs({ page: 1, limit: 1 });
  let fashn = { credits: null, unavailable: true, lowCredits: false };
  try {
    fashn = await creditsSummary();
  } catch {
    fashn = { credits: null, unavailable: true, lowCredits: false };
  }
  const recentPresented = await require('./enquiry.service').adminList({ page: 1, limit: 5, status: 'all' });
  return {
    counts: {
      totalUsers,
      totalSarees,
      openEnquiries,
      savedLooks,
      lowStockCount: lowStock.length,
    },
    trends: {
      monthlyTrends,
      monthlyEnquiries: monthlyTrends.map((row) => ({ month: row.month, enquiries: row.enquiries, conversions: row.conversions })),
      categoryBreakdown,
    },
    recentEnquiries: recentPresented.items,
    lowStockSarees: lowStock.map((row) => presentSaree(row, { admin: true })),
    tryOn: tryOn.stats,
    fashn,
  };
}

module.exports = { stats };
