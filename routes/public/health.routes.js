const { Router } = require('express');
const publicApi = require('../../controllers/public/health.controller');

const router = Router();
router.get('/', publicApi.health);
router.get('/ready', publicApi.ready);
module.exports = router;
