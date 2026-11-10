const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    key: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: true },
);

const sareeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    category: { type: String, required: true, index: true },
    brand: { type: String, required: true },
    title: { type: String, required: true },
    price: { type: Number, required: true, index: true },
    mrp: { type: Number, required: true },
    weave: { type: String, default: '' },
    fabric: { type: String, default: '' },
    zari: { type: String, default: '' },
    origin: { type: String, default: '' },
    colorTheme: { type: String, default: '' },
    description: { type: String, default: '' },
    productCode: { type: String, default: '' },
    codeParts: { type: String, default: '' },
    collectionLine: { type: String, default: '' },
    body: { type: String, default: '' },
    border: { type: String, default: '' },
    pallu: { type: String, default: '' },
    blouse: { type: String, default: '' },
    bookingTitle: { type: String, default: '' },
    codeLegend: { type: String, default: '' },
    footerLine: { type: String, default: '' },
    stockStatus: { type: String, default: 'In Stock' },
    stockQuantity: { type: Number, default: 1 },
    flatImageUrl: { type: String, default: '' },
    defaultTryOnImageUrl: { type: String, default: '' },
    images: { type: [imageSchema], default: [] },
    isFeatured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

sareeSchema.index({ title: 'text', brand: 'text', fabric: 'text', weave: 'text' });

module.exports = mongoose.model('Saree', sareeSchema);
