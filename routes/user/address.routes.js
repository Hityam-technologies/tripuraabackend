const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const { addressSchema } = require('../../validators/commerce.schema');
const { objectId } = require('../../validators/common.schema');
const { z } = require('zod');
const commerce = require('../../controllers/user/commerce.controller');

const idParam = z.object({ id: objectId });
const router = Router();
router.use(authUser);
router.get('/me/addresses', commerce.addresses);
router.post('/me/addresses', validate({ body: addressSchema }), commerce.addAddress);
router.put('/me/addresses/:id', validate({ params: idParam, body: addressSchema }), commerce.editAddress);
router.delete('/me/addresses/:id', validate({ params: idParam }), commerce.deleteAddress);
router.patch('/me/addresses/:id/default', validate({ params: idParam }), commerce.defaultAddress);
module.exports = router;
