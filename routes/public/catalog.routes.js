const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { publicSareeQuery } = require('../../validators/saree.schema');
const publicApi = require('../../controllers/public/catalog.controller');

const router = Router();
router.get('/categories', publicApi.categories);
router.get('/sarees', validate({ query: publicSareeQuery }), publicApi.sarees);
router.get('/sarees/:id', publicApi.saree);
module.exports = router;
