const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { jobQuerySchema } = require('../../validators/tryOn.schema');
const tryOn = require('../../controllers/admin/tryOn.controller');

const router = Router();
router.get('/jobs', validate({ query: jobQuerySchema }), tryOn.jobs);
router.get('/credits', tryOn.credits);
module.exports = router;
