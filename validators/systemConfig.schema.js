const { z } = require('zod');

const systemConfigSchema = z.object({
  minAppVersion: z.string().optional(),
  forceUpdate: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceNotice: z.string().trim().max(500).optional(),
  tryOnEnabled: z.boolean().optional(),
  enableTryOn: z.boolean().optional(),
  tryOnDailyLimitPerUser: z.coerce.number().int().min(1).max(100).optional(),
  tryOnUserRateMax: z.coerce.number().int().min(1).max(100).optional(),
  tryOnModel: z.enum(['tryon-v1.6', 'tryon-max']).optional(),
  featureFlags: z.object({
    tryOnEnabled: z.boolean().optional(),
    enableTryOn: z.boolean().optional(),
    enableBespokeConcierge: z.boolean().optional(),
    enableInternationalShipping: z.boolean().optional(),
    enableWishlistSharing: z.boolean().optional(),
    enableVideoReelsAutoplay: z.boolean().optional(),
  }).optional(),
});

const userQuerySchema = require('./common.schema').paginationSchema(10).extend({
  status: z.enum(['all', 'active', 'blocked']).optional(),
});

const blockSchema = z.object({
  isBlocked: z.boolean().optional(),
  reason: z.string().max(300).optional().default(''),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(6).max(24).optional(),
  avatarUrl: z.string().optional(),
});

const auditQuerySchema = require('./common.schema').paginationSchema(20).extend({
  action: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

module.exports = { systemConfigSchema, userQuerySchema, blockSchema, profileSchema, auditQuerySchema };
