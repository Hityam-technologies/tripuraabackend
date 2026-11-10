const { z } = require('zod');
const { paginationSchema, phoneSchema } = require('./common.schema');

const enquiryCreateSchema = z.object({
  sareeId: z.string().min(1),
  message: z.string().trim().min(2).max(2000),
  phone: phoneSchema.optional(),
});

const enquiryQuerySchema = paginationSchema(10).extend({
  status: z.enum(['all', 'new', 'contacted', 'confirmed', 'closed', 'cancelled']).optional(),
});

const statusSchema = z.object({
  status: z.enum(['new', 'contacted', 'confirmed', 'closed', 'cancelled']),
});

const noteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

module.exports = { enquiryCreateSchema, enquiryQuerySchema, statusSchema, noteSchema };
