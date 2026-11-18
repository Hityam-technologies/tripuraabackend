const { z } = require('zod');
const { paginationSchema } = require('./common.schema');

const optionalReferralCode = z.union([
  z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/),
  z.literal(''),
]).optional();

const codeParamSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Enter a valid referral code.'),
});

const referralSettingsSchema = z.object({
  enabled: z.boolean(),
  refereeSignupBonus: z.coerce.number().int().min(0).max(100000),
  referrerOrderReward: z.coerce.number().int().min(0).max(100000),
});

const referralListSchema = paginationSchema(20).extend({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'all']).optional(),
});

module.exports = {
  optionalReferralCode,
  codeParamSchema,
  referralSettingsSchema,
  referralListSchema,
};
