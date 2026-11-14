const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { csrf } = require('../../middleware/csrf');
const { requireAdmin } = require('../../middleware/requireAdmin');
const { adminLoginLimiter, forgotLimiter } = require('../../middleware/rateLimit');
const authSchema = require('../../validators/auth.schema');
const auth = require('../../controllers/admin/auth.controller');

const router = Router();
router.post('/login', adminLoginLimiter, validate({ body: authSchema.loginSchema }), auth.login);
router.post('/refresh', csrf, auth.refresh);
router.post('/forgot-password', forgotLimiter, validate({ body: authSchema.loginSchema.pick({ email: true }) }), auth.forgotPassword);
router.post('/reset-password', forgotLimiter, validate({ body: authSchema.resetSchema }), auth.resetPassword);
router.post('/logout', csrf, auth.logout);
router.get('/me', requireAdmin, auth.me);
router.put('/change-password', requireAdmin, validate({ body: authSchema.changePasswordSchema }), auth.changePassword);

module.exports = router;
