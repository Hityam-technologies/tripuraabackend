const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const { referralCheckLimiter } = require('../../middleware/rateLimit');
const { codeParamSchema } = require('../../validators/referral.schema');
const referral = require('../../controllers/user/referral.controller');

const router = Router();

router.get('/validate/:code', referralCheckLimiter, validate({ params: codeParamSchema }), referral.validateCode);
router.get('/me', authUser, referral.mine);

module.exports = router;
