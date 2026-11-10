const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const { profileSchema } = require('../../validators/systemConfig.schema');
const profile = require('../../controllers/user/profile.controller');

const router = Router();
router.use(authUser);
router.get('/me', profile.me);
router.put('/me', validate({ body: profileSchema }), profile.updateMe);
router.delete('/me', profile.removeMe);
module.exports = router;
