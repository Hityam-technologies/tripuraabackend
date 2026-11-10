const { Router } = require('express');
const { getEnv } = require('../config/env');
const { authUser } = require('../middleware/authUser');
const { validate } = require('../middleware/validate');
const { enquiryCreateSchema } = require('../validators/enquiry.schema');
const enquiry = require('../controllers/user/enquiry.controller');
const publicApi = require('../controllers/public/system.controller');

const router = Router();

router.use('/health', require('./public/health.routes'));
router.get('/media/access', publicApi.media);
router.use('/system', require('./public/system.routes'));
router.use('/content', require('./public/content.routes'));
router.get('/legal/:slug', publicApi.legal);
router.use('/auth', require('./public/auth.routes'));
router.use('/', require('./public/catalog.routes'));
router.use('/try-on', require('./user/tryOn.routes'));
router.use('/users', require('./user/profile.routes'));
router.use('/users', require('./user/wishlist.routes'));
router.use('/users', require('./user/enquiry.routes'));
router.post('/orders/enquiry', authUser, validate({ body: enquiryCreateSchema }), enquiry.create);
router.use('/admin', require('./admin'));

if (getEnv().PUBLIC_BASE_URL) {
  router.use('/webhooks', require('./public/webhook.routes'));
}

module.exports = router;
