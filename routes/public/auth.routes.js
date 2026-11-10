const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { loginLimiter, otpLimiter, forgotLimiter } = require('../../middleware/rateLimit');
const { authUser } = require('../../middleware/authUser');
const authSchema = require('../../validators/auth.schema');
const auth = require('../../controllers/public/auth.controller');

const router = Router();

router.post('/register', otpLimiter, validate({ body: authSchema.registerSchema }), auth.register);
router.post('/verify-otp', otpLimiter, validate({ body: authSchema.verifySchema }), auth.verifyOtp);
router.post('/resend-otp', otpLimiter, validate({ body: authSchema.resendSchema }), auth.resendOtp);
router.post('/login', loginLimiter, validate({ body: authSchema.loginSchema }), auth.login);
router.post('/refresh', validate({ body: authSchema.refreshSchema }), auth.refresh);
router.post('/logout', validate({ body: authSchema.refreshSchema }), auth.logout);
router.post('/logout-all', authUser, auth.logoutAll);
router.post('/forgot-password', forgotLimiter, validate({ body: authSchema.loginSchema.pick({ email: true }) }), auth.forgotPassword);
router.post('/reset-password', forgotLimiter, validate({ body: authSchema.resetSchema }), auth.resetPassword);

module.exports = router;
