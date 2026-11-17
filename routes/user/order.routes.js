const { Router } = require('express');
const { z } = require('zod');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const { objectId } = require('../../validators/common.schema');
const { placeOrderSchema } = require('../../validators/commerce.schema');
const commerce = require('../../controllers/user/commerce.controller');

const idParam = z.object({ id: objectId });
const router = Router();
router.use(authUser);
router.get('/', commerce.orders);
router.post('/', validate({ body: placeOrderSchema }), commerce.place);
router.get('/:id', validate({ params: idParam }), commerce.order);
router.post('/:id/cancel', validate({ params: idParam }), commerce.cancel);
module.exports = router;
