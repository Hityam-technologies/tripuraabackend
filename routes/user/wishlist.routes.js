const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const wishlist = require('../../controllers/user/wishlist.controller');

const router = Router();
router.use(authUser);
router.get('/me/wishlist', wishlist.list);
router.post('/me/wishlist/:sareeId', wishlist.add);
router.delete('/me/wishlist/:sareeId', wishlist.remove);
module.exports = router;
