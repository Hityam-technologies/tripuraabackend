const { Router } = require('express');
const webhook = require('../../controllers/public/webhook.controller');

const router = Router();
router.post('/fashn', webhook.fashn);
module.exports = router;
