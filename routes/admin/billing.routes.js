const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { staffCreateSchema } = require('../../validators/billing.schema');
const billing = require('../../controllers/billing.controller');

const router = Router();
router.get('/staff', billing.adminListStaff);
router.post('/staff', validate({ body: staffCreateSchema }), billing.adminCreateStaff);

module.exports = router;
