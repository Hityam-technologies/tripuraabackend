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

module.exports = { generateSchema, saveLookSchema, jobQuerySchema, flagSchema };
