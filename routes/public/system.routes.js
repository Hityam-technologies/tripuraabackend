const { Router } = require('express');
const publicApi = require('../../controllers/public/system.controller');

const router = Router();
router.get('/config', publicApi.systemConfig);
module.exports = router;
