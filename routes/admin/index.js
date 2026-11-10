const { Router } = require('express');
const { requireAdmin } = require('../../middleware/requireAdmin');

const router = Router();
router.use('/auth', require('./auth.routes'));
router.use(requireAdmin);
router.use('/dashboard', require('./dashboard.routes'));
router.use('/sarees', require('./sarees.routes'));
router.use('/categories', require('./categories.routes'));
router.use('/enquiries', require('./enquiries.routes'));
router.use('/users', require('./users.routes'));
router.use('/looks', require('./looks.routes'));
router.use('/try-on', require('./tryOn.routes'));
router.use('/content', require('./content.routes'));
router.use('/system-config', require('./systemConfig.routes'));
router.use('/audit-logs', require('./auditLogs.routes'));

module.exports = router;
