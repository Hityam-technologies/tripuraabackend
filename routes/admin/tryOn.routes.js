const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { jobQuerySchema, usageQuerySchema, tryOnSettingsSchema } = require('../../validators/tryOn.schema');
const tryOn = require('../../controllers/admin/tryOn.controller');
const usage = require('../../controllers/admin/tryOnUsage.controller');

const router = Router();
router.get('/jobs', validate({ query: jobQuerySchema }), tryOn.jobs);
router.get('/credits', tryOn.credits);
router.get('/users/export', validate({ query: usageQuerySchema }), usage.exportCsv);
router.get('/users', validate({ query: usageQuerySchema }), usage.users);
router.get('/users/:userId', validate({ query: usageQuerySchema }), usage.user);
router.get('/settings', usage.settings);
router.put('/settings', validate({ body: tryOnSettingsSchema }), usage.updateSettings);
router.post('/reconcile', usage.reconcile);
module.exports = router;
