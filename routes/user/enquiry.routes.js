const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const enquiry = require('../../controllers/user/enquiry.controller');
const tryOn = require('../../controllers/user/tryOn.controller');
const { saveLookSchema } = require('../../validators/tryOn.schema');

const router = Router();
router.use(authUser);
router.get('/me/drape-profiles', tryOn.profiles);
router.delete('/me/drape-profiles/:id', tryOn.removeProfile);
router.get('/me/try-on-looks', tryOn.looks);
router.post('/me/try-on-looks', validate({ body: saveLookSchema }), tryOn.saveLook);
router.delete('/me/try-on-looks/:sareeId', tryOn.removeLook);
router.get('/me/enquiries', enquiry.mine);

module.exports = router;
