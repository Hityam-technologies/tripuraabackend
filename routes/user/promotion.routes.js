const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const { couponCheckSchema } = require('../../validators/commerce.schema');
const commerce = require('../../controllers/user/commerce.controller');

const router = Router();
router.get('/coupons', commerce.coupons);
router.post('/validate', authUser, validate({ body: couponCheckSchema }), commerce.validateCoupon);
module.exports = router;
