const { z } = require('zod');

const pinSchema = z.object({
  pin: z.string().trim().regex(/^\d{6}$/, 'Security PIN must be a 6-digit code.'),
});

const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(80).optional(),
  register: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(24).optional().default(''),
  pin: z.string().trim().regex(/^\d{6}$/, 'Security PIN must be a 6-digit code.'),
});

const productQuerySchema = z.object({
  search: z.string().trim().max(80).optional().default(''),
  category: z.string().trim().max(40).optional().default('all'),
  stock: z.enum(['all', 'in_stock', 'low_stock', 'out_of_stock']).optional().default('all'),
});

const customerQuerySchema = z.object({
  search: z.string().trim().max(80).optional().default(''),
  phone: z.string().trim().max(20).optional().default(''),
});

const invoiceQuerySchema = z.object({
  search: z.string().trim().max(80).optional().default(''),
  paymentMode: z.string().trim().max(20).optional().default('all'),
  status: z.string().trim().max(20).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const lineSchema = z.object({
  sareeId: z.string().trim().max(80).optional().default(''),
  title: z.string().trim().max(80).optional().default(''),
  price: z.coerce.number().nonnegative().max(1000000).optional(),
  quantity: z.coerce.number().int().min(1).max(20).optional().default(1),
  isCustom: z.boolean().optional().default(false),
});

const paymentSchema = z.object({
  mode: z.enum(['cash', 'upi', 'card', 'split']),
  amountReceived: z.coerce.number().nonnegative().optional(),
  referenceId: z.string().trim().max(40).optional().default(''),
  cardNetwork: z.string().trim().max(20).optional().default(''),
  cardLast4: z.string().trim().max(4).optional().default(''),
  splitDetails: z.object({
    cash: z.coerce.number().nonnegative().optional().default(0),
    upi: z.coerce.number().nonnegative().optional().default(0),
    card: z.coerce.number().nonnegative().optional().default(0),
  }).optional().nullable(),
});

const invoiceCreateSchema = z.object({
  customer: z.object({
    name: z.string().trim().max(80).optional().default(''),
    phone: z.string().trim().max(20).optional().default(''),
    email: z.string().trim().max(120).optional().default(''),
    city: z.string().trim().max(80).optional().default(''),
    address: z.string().trim().max(240).optional().default(''),
    gstin: z.string().trim().max(20).optional().default(''),
    isWalkIn: z.boolean().optional().default(false),
  }),
  items: z.array(lineSchema).min(1).max(30),
  services: z.array(z.object({
    id: z.string().trim().min(1).max(40),
  })).max(10).optional().default([]),
  discountType: z.enum(['none', 'percent', 'flat']).optional().default('none'),
  discountValue: z.coerce.number().nonnegative().max(1000000).optional().default(0),
  couponCode: z.string().trim().max(30).optional().default(''),
  payment: paymentSchema,
  notes: z.string().trim().max(500).optional().default(''),
  idempotencyKey: z.string().trim().min(8).max(80),
});

const holdSchema = z.object({
  customer: z.record(z.string(), z.any()).optional().default({}),
  items: z.array(z.record(z.string(), z.any())).min(1).max(30),
  services: z.array(z.record(z.string(), z.any())).max(10).optional().default([]),
  note: z.string().trim().max(240).optional().default(''),
});

const returnSchema = z.object({
  reason: z.string().trim().min(3).max(240).optional().default('Customer exchange / return'),
});

const restockSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(100).optional().default(1),
});

const customerCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(10).max(20),
  email: z.string().trim().max(120).optional().default(''),
  city: z.string().trim().max(80).optional().default(''),
  address: z.string().trim().max(240).optional().default(''),
  gstin: z.string().trim().max(20).optional().default(''),
});

module.exports = {
  pinSchema,
  staffCreateSchema,
  productQuerySchema,
  customerQuerySchema,
  invoiceQuerySchema,
  invoiceCreateSchema,
  holdSchema,
  returnSchema,
  restockSchema,
  customerCreateSchema,
};
