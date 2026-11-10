const { ApiError } = require('../utils/ApiError');
const Content = require('../models/Content');

async function read(key) {
  const doc = await Content.findOne({ key }).lean();
  return doc ? doc.data : null;
}

async function write(key, data) {
  const existing = await Content.findOne({ key }).lean();
  await Content.updateOne({ key }, { $set: { data } }, { upsert: true });
  return { before: existing?.data || null, after: data };
}

async function hero() {
  return (await read('hero')) || {};
}
async function storeAddress() {
  return (await read('store')) || {};
}
async function supportChannels() {
  const data = await read('support');
  return data?.channels || data || [];
}
async function faq() {
  const data = await read('faq');
  return data?.items || [];
}
async function legal(slug) {
  if (!['terms', 'policy'].includes(slug)) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Legal page not found.');
  const data = await read(`legal-${slug}`);
  if (!data) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Legal page not found.');
  return data;
}

module.exports = { read, write, hero, storeAddress, supportChannels, faq, legal };
