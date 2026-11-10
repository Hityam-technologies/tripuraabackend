const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { paginationSchema } = require('../../validators/common.schema');
const { flagSchema } = require('../../validators/tryOn.schema');
const looks = require('../../controllers/admin/looks.controller');

const router = Router();
router.get('/', validate({ query: paginationSchema(20) }), looks.looks);
router.patch('/:id/flag', validate({ body: flagSchema }), looks.flagLook);
router.delete('/:id', looks.deleteLook);
module.exports = router;
