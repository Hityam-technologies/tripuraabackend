const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../../middleware/validate');
const { objectId } = require('../../validators/common.schema');
const { orderListSchema, orderStatusSchema, couponSchema } = require('../../validators/commerce.schema');
const { referralSettingsSchema, referralListSchema } = require('../../validators/referral.schema');
const commerce = require('../../controllers/admin/commerce.controller');
const referral = require('../../controllers/admin/referral.controller');

const idParam = z.object({ id: objectId });
const activeSchema = z.object({ isActive: z.boolean() });
const router = Router();

router.get('/orders', validate({ query: orderListSchema }), commerce.orders);
router.get('/orders/:id', validate({ params: idParam }), commerce.order);
router.patch('/orders/:id/status', validate({ params: idParam, body: orderStatusSchema }), commerce.status);
router.get('/coupons', commerce.coupons);
router.post('/coupons', validate({ body: couponSchema }), commerce.createCoupon);
router.put('/coupons/:id', validate({ params: idParam, body: couponSchema }), commerce.updateCoupon);
router.patch('/coupons/:id', validate({ params: idParam, body: activeSchema }), commerce.couponActive);
router.get('/referrals/settings', referral.settings);
router.put('/referrals/settings', validate({ body: referralSettingsSchema }), referral.saveSettings);
router.get('/referrals', validate({ query: referralListSchema }), referral.list);

module.exports = router;
