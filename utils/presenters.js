const { formatInr } = require('./price');

function presentSaree(doc, { admin = false } = {}) {
  const images = [...(doc.images || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const primary = images.find((image) => image.isPrimary) || images[0];
  const imageUrl = primary?.url || doc.flatImageUrl || '';
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
      url: image.url,
      sortOrder: image.sortOrder,
      isPrimary: Boolean(image.isPrimary),
    })),
    image: imageUrl,
    tryOnImage: doc.defaultTryOnImageUrl || imageUrl,
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
