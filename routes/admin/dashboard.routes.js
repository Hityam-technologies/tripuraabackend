const { Router } = require('express');
const dashboard = require('../../controllers/admin/dashboard.controller');
const router = Router();
router.get('/stats', dashboard.stats);
module.exports = router;
