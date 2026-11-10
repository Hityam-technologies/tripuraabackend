const { ApiError } = require('../utils/ApiError');
const { pageMeta } = require('../utils/pagination');
const { presentSaree, presentCategory } = require('../utils/presenters');
const { randomToken } = require('../utils/tokens');
const Saree = require('../models/Saree');
const Category = require('../models/Category');
const { storage } = require('./storage');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function customerFilter(extra = {}) {
  return { isActive: true, deletedAt: null, ...extra };
}

async function listCategories(activeOnly = true) {
  const filter = activeOnly ? { isActive: true } : {};
  const rows = await Category.find(filter).sort({ sortOrder: 1 }).lean();
  return rows.map(presentCategory);
}

async function listSarees(query) {
  const filter = customerFilter();
  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.featured === true) filter.isFeatured = true;
  if (query.search) {
    const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['title', 'brand', 'fabric', 'weave', 'origin', 'zari'].map((field) => ({
      [field]: { $regex: term, $options: 'i' },
    }));
  }
  const sortMap = {
    featured: { isFeatured: -1, createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    newest: { createdAt: -1 },
  };
  const sort = sortMap[query.sort] || sortMap.featured;
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    Saree.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    Saree.countDocuments(filter),
  ]);
  const meta = pageMeta(query.page, query.limit, total);
  return { items: rows.map((row) => presentSaree(row)), ...meta };
}

async function getSaree(id) {
  const row = await Saree.findOne(customerFilter({ id })).lean();
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  return presentSaree(row);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function adminList(query) {
  const filter = {};
  if (query.status === 'active') filter.isActive = true;
  if (query.status === 'inactive') filter.isActive = false;
  if (!query.includeDeleted) filter.deletedAt = null;
  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.stock === 'in_stock') filter.stockQuantity = { $gt: 2 };
  if (query.stock === 'low_stock') filter.stockQuantity = { $gt: 0, $lte: 2 };
  if (query.stock === 'out_of_stock') filter.stockQuantity = 0;
  if (query.search) {
    const term = escapeRegex(query.search);
    filter.$or = ['title', 'brand', 'weave', 'origin', 'zari', 'fabric'].map((field) => ({
      [field]: { $regex: term, $options: 'i' },
    }));
  }
  const sortMap = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    title_asc: { title: 1 },
    newest: { createdAt: -1 },
  };
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    Saree.find(filter).sort(sortMap[query.sortBy] || sortMap.newest).skip(skip).limit(query.limit).lean(),
    Saree.countDocuments(filter),
  ]);
  const meta = pageMeta(query.page, query.limit, total);
  return { items: rows.map((row) => presentSaree(row, { admin: true })), ...meta };
}

async function adminGet(id) {
  const row = await Saree.findOne({ id }).lean();
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  return presentSaree(row, { admin: true });
}

function normalizeImageUrl(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object' && value.url) return String(value.url).trim();
  return '';
}

function imageDocs(urls = []) {
  return urls
    .map(normalizeImageUrl)
    .filter(Boolean)
    .map((url, index) => ({
      url,
      key: '',
      sortOrder: index,
      isPrimary: index === 0,
    }));
}

async function createSaree(input) {
  const slug = input.slug || slugify(input.title);
  const clash = await Saree.findOne({ slug });
  if (clash) throw new ApiError(409, 'DUPLICATE_SLUG', 'A saree with that slug already exists.');
  const urls = input.images?.length ? input.images : [input.image].filter(Boolean);
  const images = imageDocs(urls);
  const primary = images.find((image) => image.isPrimary)?.url || input.image || '';
  const doc = await Saree.create({
    id: `saree-${randomToken(6).toLowerCase()}`,
    slug,
    category: input.category || 'sarees',
    brand: input.brand || 'Tripuraa Sangrahah',
    title: input.title,
    price: input.numericPrice ?? 0,
    mrp: input.numericMrp ?? input.numericPrice ?? 0,
    weave: input.weave || '',
    fabric: input.fabric || '',
    zari: input.zari || '',
    origin: input.origin || '',
    colorTheme: input.colorTheme || '',
    description: input.description || '',
    productCode: input.productCode || '',
    codeParts: input.codeParts || '',
    collectionLine: input.collectionLine || '',
    body: input.body || '',
    border: input.border || '',
    pallu: input.pallu || '',
    blouse: input.blouse || '',
    bookingTitle: input.bookingTitle || '',
    codeLegend: input.codeLegend || '',
    footerLine: input.footerLine || '',
    stockStatus: input.stock || 'In Stock',
    stockQuantity: input.stockQuantity ?? 1,
    flatImageUrl: primary,
    defaultTryOnImageUrl: input.tryOnImage || primary,
    images,
    isFeatured: Boolean(input.isFeatured),
    isActive: input.isActive !== false,
  });
  return presentSaree(doc.toObject(), { admin: true });
}

async function updateSaree(id, input) {
  const doc = await Saree.findOne({ id });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  const before = presentSaree(doc.toObject(), { admin: true });
  if (input.slug && input.slug !== doc.slug) {
    const clash = await Saree.findOne({ slug: input.slug, id: { $ne: id } });
    if (clash) throw new ApiError(409, 'DUPLICATE_SLUG', 'A saree with that slug already exists.');
    doc.slug = input.slug;
  }
  const map = {
    title: 'title',
    brand: 'brand',
    category: 'category',
    weave: 'weave',
    fabric: 'fabric',
    zari: 'zari',
    origin: 'origin',
    colorTheme: 'colorTheme',
    description: 'description',
    productCode: 'productCode',
    codeParts: 'codeParts',
    collectionLine: 'collectionLine',
    body: 'body',
    border: 'border',
    pallu: 'pallu',
    blouse: 'blouse',
    bookingTitle: 'bookingTitle',
    codeLegend: 'codeLegend',
    footerLine: 'footerLine',
  };
  for (const [key, field] of Object.entries(map)) {
    if (input[key] != null) doc[field] = input[key];
  }
  if (input.numericPrice != null) doc.price = input.numericPrice;
  if (input.numericMrp != null) doc.mrp = input.numericMrp;
  if (input.stock != null) doc.stockStatus = input.stock;
  if (input.stockQuantity != null) doc.stockQuantity = input.stockQuantity;
  if (input.isFeatured != null) doc.isFeatured = input.isFeatured;
  if (input.isActive != null) doc.isActive = input.isActive;
  if (input.tryOnImage) doc.defaultTryOnImageUrl = normalizeImageUrl(input.tryOnImage);
  if (input.images) {
    doc.images = imageDocs(input.images);
    doc.flatImageUrl = doc.images[0]?.url || '';
    if (!input.tryOnImage && doc.flatImageUrl) {
      doc.defaultTryOnImageUrl = doc.flatImageUrl;
    }
  } else if (input.image) {
    const primary = normalizeImageUrl(input.image);
    if (primary) {
      doc.flatImageUrl = primary;
      if (!doc.images.length) {
        doc.images = imageDocs([primary]);
      } else {
        const currentPrimary = doc.images.find((image) => image.isPrimary) || doc.images[0];
        if (currentPrimary) currentPrimary.url = primary;
      }
      if (!input.tryOnImage) doc.defaultTryOnImageUrl = primary;
    }
  }
  await doc.save();
  return { before, after: presentSaree(doc.toObject(), { admin: true }) };
}

async function softDelete(id) {
  const doc = await Saree.findOne({ id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  const before = presentSaree(doc.toObject(), { admin: true });
  doc.deletedAt = new Date();
  doc.isActive = false;
  await doc.save();
  return { before, after: presentSaree(doc.toObject(), { admin: true }) };
}

async function duplicateSaree(id) {
  const doc = await Saree.findOne({ id }).lean();
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  const copy = await createSaree({
    title: `${doc.title} Copy`,
    brand: doc.brand,
    slug: `${doc.slug}-copy-${randomToken(3).toLowerCase()}`,
    category: doc.category,
    numericPrice: doc.price,
    numericMrp: doc.mrp,
    weave: doc.weave,
    fabric: doc.fabric,
    zari: doc.zari,
    origin: doc.origin,
    colorTheme: doc.colorTheme,
    description: doc.description,
    productCode: doc.productCode,
    codeParts: doc.codeParts,
    collectionLine: doc.collectionLine,
    body: doc.body,
    border: doc.border,
    pallu: doc.pallu,
    blouse: doc.blouse,
    bookingTitle: doc.bookingTitle,
    codeLegend: doc.codeLegend,
    footerLine: doc.footerLine,
    stock: doc.stockStatus,
    stockQuantity: doc.stockQuantity,
    images: (doc.images || []).map((image) => image.url),
    tryOnImage: doc.defaultTryOnImageUrl,
    isFeatured: false,
    isActive: false,
  });
  return copy;
}

async function bulkSarees({ ids, action }) {
  const updates = {
    activate: { isActive: true },
    deactivate: { isActive: false },
    feature: { isFeatured: true },
    unfeature: { isFeatured: false },
    delete: { deletedAt: new Date(), isActive: false },
  };
  const update = updates[action];
  if (!update) throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown bulk action.');
  const result = await Saree.updateMany({ id: { $in: ids } }, { $set: update });
  return { matched: result.matchedCount, modified: result.modifiedCount, action };
}

async function addImages(id, files) {
  const doc = await Saree.findOne({ id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  const disk = storage();
  const before = presentSaree(doc.toObject(), { admin: true });
  let order = doc.images.length;
  for (const file of files) {
    const stored = await disk.put({
      buffer: file.buffer,
      visibility: 'public',
      extension: file.extension,
      contentType: file.mime,
    });
    doc.images.push({
      url: stored.url,
      key: stored.key,
      sortOrder: order,
      isPrimary: doc.images.length === 0 && order === 0,
    });
    order += 1;
  }
  if (!doc.flatImageUrl && doc.images[0]) doc.flatImageUrl = doc.images[0].url;
  if (!doc.defaultTryOnImageUrl && doc.images[0]) doc.defaultTryOnImageUrl = doc.images[0].url;
  await doc.save();
  return { before, after: presentSaree(doc.toObject(), { admin: true }) };
}

/** Append image URLs (admin paste) without multipart upload */
async function addImageUrls(id, urls = []) {
  const doc = await Saree.findOne({ id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  const before = presentSaree(doc.toObject(), { admin: true });
  const cleaned = urls.map(normalizeImageUrl).filter(Boolean);
  if (!cleaned.length) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Provide at least one image URL.');
  }
  let order = doc.images.length;
  for (const url of cleaned) {
    doc.images.push({
      url,
      key: '',
      sortOrder: order,
      isPrimary: doc.images.length === 0 && order === 0,
    });
    order += 1;
  }
  if (!doc.flatImageUrl && doc.images[0]) doc.flatImageUrl = doc.images[0].url;
  if (!doc.defaultTryOnImageUrl && doc.images[0]) doc.defaultTryOnImageUrl = doc.images[0].url;
  await doc.save();
  return { before, after: presentSaree(doc.toObject(), { admin: true }) };
}

async function reorderImages(id, order) {
  const doc = await Saree.findOne({ id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  const before = presentSaree(doc.toObject(), { admin: true });
  let primarySet = false;
  for (const image of doc.images) {
    const match = order.find((item) => item.id === String(image._id));
    if (!match) continue;
    image.sortOrder = match.sortOrder;
    image.isPrimary = Boolean(match.isPrimary) && !primarySet;
    if (image.isPrimary) primarySet = true;
  }
  if (!primarySet && doc.images.length) {
    const first = [...doc.images].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    first.isPrimary = true;
  }
  const primary = doc.images.find((image) => image.isPrimary);
  if (primary) doc.flatImageUrl = primary.url;
  await doc.save();
  return { before, after: presentSaree(doc.toObject(), { admin: true }) };
}

async function deleteImage(id, imageId) {
  const doc = await Saree.findOne({ id, deletedAt: null });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${id}' was not found.`);
  const image = doc.images.id(imageId);
  if (!image) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Image not found.');
  const before = presentSaree(doc.toObject(), { admin: true });
  if (image.key) await storage().delete(image.key);
  image.deleteOne();
  if (!doc.images.some((item) => item.isPrimary) && doc.images[0]) doc.images[0].isPrimary = true;
  doc.flatImageUrl = doc.images.find((item) => item.isPrimary)?.url || '';
  if (!doc.images.some((item) => item.url === doc.defaultTryOnImageUrl)) {
    doc.defaultTryOnImageUrl = doc.flatImageUrl;
  }
  await doc.save();
  return { before, after: presentSaree(doc.toObject(), { admin: true }) };
}

async function createCategory(input) {
  const existing = await Category.findOne({ id: input.id });
  if (existing) throw new ApiError(409, 'DUPLICATE', 'That category id already exists.');
  const count = await Category.countDocuments();
  const doc = await Category.create({
    id: input.id,
    label: input.label,
    coverImageUrl: input.coverImageUrl || '',
    sortOrder: input.sortOrder ?? count + 1,
    isActive: input.isActive !== false,
  });
  return presentCategory(doc.toObject());
}

async function updateCategory(id, input) {
  const doc = await Category.findOne({ id });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Category not found.');
  const before = presentCategory(doc.toObject());
  if (input.label != null) doc.label = input.label;
  if (input.coverImageUrl != null) doc.coverImageUrl = input.coverImageUrl;
  if (input.isActive != null) doc.isActive = input.isActive;
  if (input.sortOrder != null) doc.sortOrder = input.sortOrder;
  await doc.save();
  return { before, after: presentCategory(doc.toObject()) };
}

async function deleteCategory(id, reassignTo) {
  if (id === 'all') throw new ApiError(400, 'VALIDATION_ERROR', 'The All category cannot be deleted.');
  const doc = await Category.findOne({ id });
  if (!doc) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Category not found.');
  const used = await Saree.countDocuments({ category: id, deletedAt: null });
  if (used && !reassignTo) {
    throw new ApiError(409, 'CATEGORY_IN_USE', 'Reassign sarees before deleting this category.');
  }
  if (used && reassignTo) {
    const target = await Category.findOne({ id: reassignTo });
    if (!target) throw new ApiError(400, 'VALIDATION_ERROR', 'Reassignment category was not found.');
    await Saree.updateMany({ category: id }, { $set: { category: reassignTo } });
  }
  await doc.deleteOne();
  return { id, label: doc.label };
}

async function reorderCategories(order) {
  for (let index = 0; index < order.length; index += 1) {
    await Category.updateOne({ id: order[index] }, { $set: { sortOrder: index + 1 } });
  }
  return listCategories(false);
}

module.exports = {
  listCategories,
  listSarees,
  getSaree,
  adminList,
  adminGet,
  createSaree,
  updateSaree,
  softDelete,
  duplicateSaree,
  bulkSarees,
  addImages,
  addImageUrls,
  reorderImages,
  deleteImage,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
};
