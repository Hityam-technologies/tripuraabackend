const { Router } = require('express');
const publicApi = require('../../controllers/public/content.controller');

const router = Router();
router.get('/hero', publicApi.hero);
router.get('/store-address', publicApi.storeAddress);
router.get('/support-channels', publicApi.supportChannels);
router.get('/faq', publicApi.faq);
module.exports = router;
