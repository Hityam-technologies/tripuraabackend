const sharp = require('sharp');
const Saree = require('../../models/Saree');
const Category = require('../../models/Category');

async function jpegBuffer(width = 400, height = 600) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 40, b: 60 } },
  }).jpeg().toBuffer();
}

async function seedCategory(overrides = {}) {
  return Category.create({
    id: 'sarees',
    label: 'Kanchipuram',
    coverImageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400',
    sortOrder: 1,
    isActive: true,
    ...overrides,
  });
}

async function seedSaree(overrides = {}) {
  return Saree.create({
    id: 'saree-1',
    slug: 'swarna-kanchipuram',
    category: 'sarees',
    brand: 'Tripuraa Heritage',
    title: 'Swarna Kanchipuram Pure Zari Silk',
    price: 28500,
    mrp: 34000,
    weave: 'Kanchipuram Handloom',
    fabric: 'Pure Mulberry Silk',
    zari: 'Gold & Silver Zari',
    origin: 'Kanchipuram, Tamil Nadu',
    colorTheme: 'gold',
    description: 'Temple border Kanchipuram.',
    stockStatus: 'In Stock',
    stockQuantity: 2,
    flatImageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900',
    defaultTryOnImageUrl: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=900',
    images: [{ url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=900', sortOrder: 0, isPrimary: true }],
    isFeatured: true,
    isActive: true,
    ...overrides,
  });
}

module.exports = { jpegBuffer, seedCategory, seedSaree };
