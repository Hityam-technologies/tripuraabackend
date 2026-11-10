const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { auditQuerySchema } = require('../../validators/systemConfig.schema');
const audit = require('../../controllers/admin/auditLogs.controller');

const router = Router();
router.get('/', validate({ query: auditQuerySchema }), audit.listAudit);
module.exports = router;
