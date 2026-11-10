const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validators/content.schema');
const content = require('../../controllers/admin/content.controller');

const router = Router();
router.get('/hero', content.getHero);
router.put('/hero', validate({ body: schemas.heroSchema }), content.putHero);
router.get('/store', content.getStore);
router.put('/store', validate({ body: schemas.storeSchema }), content.putStore);
router.get('/support', content.getSupport);
router.put('/support', validate({ body: schemas.supportSchema }), content.putSupport);
router.get('/faq', content.getFaq);
router.put('/faq', validate({ body: schemas.faqSchema }), content.putFaq);
router.get('/legal/:type', content.getLegal);
router.put('/legal/:type', validate({ body: schemas.legalSchema }), content.putLegal);
module.exports = router;
