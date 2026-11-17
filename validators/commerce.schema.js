const { z } = require('zod');
const { objectId, paginationSchema } = require('./common.schema');

const cartItemSchema = z.object({
  productId: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(20).optional().default(1),
});

const quantitySchema = z.object({
  quantity: z.coerce.number().int().min(0).max(20),
});

const productParamSchema = z.object({
  productId: z.string().trim().min(1).max(80),
});

const addressSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(24),
  addressLine1: z.string().trim().min(3).max(160),
  addressLine2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a 6-digit PIN code.'),
  isDefault: z.boolean().optional(),
});

const couponCheckSchema = z.object({
  code: z.string().trim().min(2).max(40),
  subtotal: z.coerce.number().optional(),
  itemIds: z.array(z.string()).optional(),
});

const placeOrderSchema = z.object({
  paymentMethod: z.enum(['ONLINE', 'COD']),
  promoCode: z.string().trim().max(40).optional().default(''),
  shippingAddressId: objectId.optional(),
  shippingAddress: addressSchema.optional(),
});

const orderListSchema = paginationSchema(20).extend({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'all']).optional(),
});

const orderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
});

const couponSchema = z.object({
  code: z.string().trim().min(2).max(40),
  title: z.string().trim().min(2).max(120),
  subtitle: z.string().trim().max(180).optional().default(''),
  type: z.enum(['percent', 'flat']),
  value: z.coerce.number().positive(),
  minOrder: z.coerce.number().min(0).optional().default(0),
  maxDiscount: z.coerce.number().min(0).nullable().optional(),
  firstOrderOnly: z.boolean().optional().default(false),
  icon: z.string().trim().max(40).optional(),
  isActive: z.boolean().optional(),
});

module.exports = {
  cartItemSchema,
  quantitySchema,
  productParamSchema,
  addressSchema,
  couponCheckSchema,
  placeOrderSchema,
  orderListSchema,
  orderStatusSchema,
  couponSchema,
};
