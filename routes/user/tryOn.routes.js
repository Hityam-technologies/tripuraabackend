const { Router } = require('express');
const { authUser } = require('../../middleware/authUser');
const { validate } = require('../../middleware/validate');
const { memoryUpload, preparePortrait } = require('../../middleware/upload');
const { generateSchema, saveLookSchema } = require('../../validators/tryOn.schema');
const tryOn = require('../../controllers/user/tryOn.controller');

const router = Router();
router.post('/upload-photo', authUser, memoryUpload('photo'), preparePortrait, tryOn.uploadPhoto);
router.post('/generate-drape', authUser, validate({ body: generateSchema }), tryOn.generate);
router.get('/jobs/:id', authUser, tryOn.job);

module.exports = router;
