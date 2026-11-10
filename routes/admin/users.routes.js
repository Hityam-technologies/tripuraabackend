const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { userQuerySchema, blockSchema } = require('../../validators/systemConfig.schema');
const users = require('../../controllers/admin/users.controller');

const router = Router();
router.get('/', validate({ query: userQuerySchema }), users.listUsers);
router.get('/:id', users.getUser);
router.put('/:id/block', validate({ body: blockSchema }), users.blockUser);
router.patch('/:id/block', validate({ body: blockSchema }), users.blockUser);
router.patch('/:id/unblock', users.unblockUser);
module.exports = router;
