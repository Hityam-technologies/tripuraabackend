const { z } = require('zod');
const { objectId, paginationSchema } = require('./common.schema');

const generateSchema = z.object({
  sareeId: z.string().min(1),
  drapeProfileId: objectId,
}).strict();

const saveLookSchema = z.object({
  jobId: objectId,
}).strict();

const jobQuerySchema = paginationSchema(20).extend({
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const flagSchema = z.object({
  isFlagged: z.boolean(),
  reason: z.string().max(300).optional(),
});

const usageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(80).optional(),
  sort: z.string().trim().max(40).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  preset: z.enum(['free', 'paying', 'negative', 'never', 'abuse', 'high', 'spenders', 'cost']).optional(),
  photos: z.enum(['true', 'false']).optional(),
  minCompleted: z.coerce.number().int().min(1).max(10000).optional(),
});

const tryOnSettingsSchema = z.object({
  rupeesPerCredit: z.coerce.number().min(0).max(10000).optional(),
  asOf: z.string().optional(),
  freeTryOnQuota: z.coerce.number().int().min(0).max(100).optional(),
  paidTryOnPriceInr: z.coerce.number().min(0).max(100000).optional(),
  chargeEnforced: z.boolean().optional(),
  reason: z.string().trim().min(3).max(300),
});

module.exports = {
  generateSchema, saveLookSchema, jobQuerySchema, flagSchema, usageQuerySchema, tryOnSettingsSchema,
};
