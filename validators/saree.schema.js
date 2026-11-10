const { z } = require('zod');
const { paginationSchema } = require('./common.schema');

const imageUrlSchema = z.union([
  z.string().trim().min(4),
  z.object({ url: z.string().trim().min(4) }).strip(),
]).transform((value) => (typeof value === 'string' ? value : value.url));

const sareeWriteSchema = z.object({
  title: z.string().trim().min(2),
  brand: z.string().trim().min(1).optional(),
  slug: z.string().trim().min(2).optional(),
  category: z.string().trim().min(1).optional(),
  numericPrice: z.coerce.number().nonnegative().optional(),
  numericMrp: z.coerce.number().nonnegative().optional(),
  weave: z.string().optional(),
  fabric: z.string().optional(),
  zari: z.string().optional(),
  origin: z.string().optional(),
  colorTheme: z.string().optional(),
  description: z.string().optional(),
  productCode: z.string().trim().max(40).optional(),
  codeParts: z.string().trim().max(80).optional(),
  collectionLine: z.string().trim().max(160).optional(),
  body: z.string().trim().max(500).optional(),
  border: z.string().trim().max(500).optional(),
  pallu: z.string().trim().max(500).optional(),
  blouse: z.string().trim().max(500).optional(),
  bookingTitle: z.string().trim().max(200).optional(),
  codeLegend: z.string().trim().max(240).optional(),
  footerLine: z.string().trim().max(240).optional(),
  stock: z.string().optional(),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  images: z.array(imageUrlSchema).optional(),
  image: imageUrlSchema.optional(),
  tryOnImage: imageUrlSchema.optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const publicSareeQuery = paginationSchema(20).extend({
  category: z.string().optional(),
  sort: z.enum(['featured', 'price_asc', 'price_desc', 'newest']).optional(),
  featured: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

const adminSareeQuery = paginationSchema(10).extend({
  category: z.string().optional(),
  stock: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  status: z.enum(['all', 'active', 'inactive']).optional(),
  sortBy: z.enum(['price_asc', 'price_desc', 'newest', 'title_asc']).optional(),
  includeDeleted: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.enum(['activate', 'deactivate', 'feature', 'unfeature', 'delete']),
});

const imageOrderSchema = z.object({
  order: z.array(z.object({
    id: z.string().min(1),
    sortOrder: z.coerce.number().int().min(0),
    isPrimary: z.boolean().optional(),
  })).min(1),
});

module.exports = { sareeWriteSchema, publicSareeQuery, adminSareeQuery, bulkSchema, imageOrderSchema };
