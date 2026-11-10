const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const content = require('../../services/content.service');
const catalog = require('../../services/catalog.service');
const { getPublicConfig } = require('../../services/systemConfig.service');
const mongoose = require('mongoose');
const { storage } = require('../../services/storage');

const systemConfig = asyncHandler(async (_req, res) => {
  sendOk(res, await getPublicConfig());
});

const hero = asyncHandler(async (_req, res) => sendOk(res, await content.hero()));
const storeAddress = asyncHandler(async (_req, res) => sendOk(res, await content.storeAddress()));
const supportChannels = asyncHandler(async (_req, res) => sendOk(res, await content.supportChannels()));
const faq = asyncHandler(async (_req, res) => sendOk(res, await content.faq()));
const legal = asyncHandler(async (req, res) => sendOk(res, await content.legal(req.params.slug || req.params.type)));

const categories = asyncHandler(async (_req, res) => sendOk(res, await catalog.listCategories(true)));
const sarees = asyncHandler(async (req, res) => {
  const data = await catalog.listSarees(req.queryData);
  sendOk(res, data, { meta: { total: data.total, page: data.page, limit: data.limit } });
});
const saree = asyncHandler(async (req, res) => sendOk(res, await catalog.getSaree(req.params.id)));

const health = asyncHandler(async (_req, res) => sendOk(res, { status: 'ok' }));
const ready = asyncHandler(async (_req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
  if (db !== 'up') return res.status(503).json({ success: false, error: { code: 'NOT_READY', message: 'Database is not ready.' } });
  return sendOk(res, { status: 'ready', db });
});

const media = asyncHandler(async (req, res) => {
  const key = storage().verifyToken(String(req.query.token || ''));
  const bytes = await storage().read(key);
  res.setHeader('Content-Type', key.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.send(bytes);
});

module.exports = {
  systemConfig, hero, storeAddress, supportChannels, faq, legal, categories, sarees, saree, health, ready, media,
};
