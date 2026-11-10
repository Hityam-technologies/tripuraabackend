const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { systemConfigSchema } = require('../../validators/systemConfig.schema');
const system = require('../../controllers/admin/systemConfig.controller');

const router = Router();
router.get('/', system.getSystem);
router.put('/', validate({ body: systemConfigSchema }), system.putSystem);
module.exports = router;
