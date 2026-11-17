const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const { cartItemSchema, quantitySchema, productParamSchema } = require('../../validators/commerce.schema');
const commerce = require('../../controllers/user/commerce.controller');

const router = Router();
router.use(authUser);
router.get('/', commerce.cart);
router.post('/items', validate({ body: cartItemSchema }), commerce.addItem);
router.put('/items/:productId', validate({ params: productParamSchema, body: quantitySchema }), commerce.setQuantity);
router.delete('/items/:productId', validate({ params: productParamSchema }), commerce.removeItem);
router.delete('/', commerce.clear);
module.exports = router;
