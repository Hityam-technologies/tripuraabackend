const { z } = require('zod');

const categoryWriteSchema = z.object({
  id: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1),
  coverImageUrl: z.string().optional().default(''),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const categoryReorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

module.exports = { categoryWriteSchema, categoryReorderSchema };
