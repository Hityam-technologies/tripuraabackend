const { formatInr } = require('./price');

// The phone image loader trusts the .jpg ending. ImageKit otherwise answers
// with a WebP file, and the card stays blank. Ask for a JPEG the phone can draw.
function catalogImageUrl(url, admin) {
  if (admin || typeof url !== 'string' || !/^https?:\/\/ik\.imagekit\.io\//.test(url)) return url || '';
  if (/[?&]tr=[^#]*f-jpg/.test(url)) return url;
  if (/[?&]tr=/.test(url)) return url.replace(/([?&]tr=)/, '$1f-jpg,');
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}tr=f-jpg,w-900,c-at_max,q-80`;
}

function cleanFeatures(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({
      key: String(item?.key || '').trim().slice(0, 80),
      value: String(item?.value || '').trim().slice(0, 500),
    }))
    .filter((item) => item.key && item.value)
    .slice(0, 40);
}

function legacyLinesFromFeatures(features) {
  const find = (name) => {
    const found = features.find((item) => item.key.toLowerCase() === name);
    return found ? found.value : '';
  };
  return {
    body: find('body'),
    border: find('border'),
    pallu: find('pallu'),
    blouse: find('blouse'),
  };
}

function featuresForRead(doc) {
  const stored = cleanFeatures(doc.features);
  if (stored.length) return stored;
  return cleanFeatures([
    { key: 'Body', value: doc.body },
    { key: 'Border', value: doc.border },
    { key: 'Pallu', value: doc.pallu },
    { key: 'Blouse', value: doc.blouse },
  ]);
}

function presentSaree(doc, { admin = false } = {}) {
  const images = [...(doc.images || [])].sort((a, b) => {
    if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) return a.isPrimary ? -1 : 1;
    return (a.sortOrder || 0) - (b.sortOrder || 0);
  });
  const primary = images.find((image) => image.isPrimary) || images[0];
  const imageUrl = catalogImageUrl(primary?.url || doc.flatImageUrl || '', admin);
  const payload = {
    id: doc.id,
    slug: doc.slug,
    brand: doc.brand,
    title: doc.title,
    price: formatInr(doc.price),
    numericPrice: doc.price,
    mrp: formatInr(doc.mrp),
    numericMrp: doc.mrp,
    category: doc.category,
    weave: doc.weave,
    fabric: doc.fabric,
    zari: doc.zari,
    origin: doc.origin,
    colorTheme: doc.colorTheme,
    description: doc.description,
    productCode: doc.productCode || '',
    codeParts: doc.codeParts || '',
    collectionLine: doc.collectionLine || '',
    body: doc.body || '',
    border: doc.border || '',
    pallu: doc.pallu || '',
    blouse: doc.blouse || '',
    bookingTitle: doc.bookingTitle || '',
    codeLegend: doc.codeLegend || '',
    footerLine: doc.footerLine || '',
    stock: doc.stockStatus,
    stockQuantity: doc.stockQuantity,
    images: images.map((image) => ({
      id: String(image._id),
      url: catalogImageUrl(image.url, admin),
      key: admin ? (image.key || '') : undefined,
      sortOrder: image.sortOrder,
      isPrimary: Boolean(image.isPrimary),
    })),
    image: imageUrl,
    tryOnImage: catalogImageUrl(doc.defaultTryOnImageUrl || primary?.url || doc.flatImageUrl || '', admin) || imageUrl,
    isFeatured: doc.isFeatured,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
  if (admin) payload.deletedAt = doc.deletedAt || null;
  return payload;
}

function presentCategory(doc) {
  return {
    id: doc.id,
    label: doc.label,
    image: doc.coverImageUrl,
    coverImageUrl: doc.coverImageUrl,
    sortOrder: doc.sortOrder,
    order: doc.sortOrder,
    isActive: doc.isActive,
  };
}

module.exports = { presentSaree, presentCategory };
module.exports = { presentSaree, presentCategory, cleanFeatures, legacyLinesFromFeatures };