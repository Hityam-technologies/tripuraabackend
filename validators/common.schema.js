const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');

function paginationSchema(defaultLimit = 20) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(defaultLimit),
    search: z.string().trim().max(80).optional(),
  });
}

const passwordSchema = z.string().min(8).regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must include a special character.');
const emailSchema = z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email.');
const phoneSchema = z.string().trim().min(6).max(24);

module.exports = { objectId, paginationSchema, passwordSchema, emailSchema, phoneSchema };
