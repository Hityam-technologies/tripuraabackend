const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { requireBilling } = require('../../middleware/requireBilling');
const { billingPinLimiter } = require('../../middleware/rateLimit');
const schemas = require('../../validators/billing.schema');
const billing = require('../../controllers/billing.controller');

const router = Router();

router.post('/auth/pin', billingPinLimiter, validate({ body: schemas.pinSchema }), billing.pin);

router.use(requireBilling);
router.post('/auth/logout', billing.logout);
router.get('/auth/me', billing.me);
router.get('/settings', billing.settings);
router.get('/services', billing.services);
router.get('/categories', billing.categories);
router.get('/products', validate({ query: schemas.productQuerySchema }), billing.products);
router.get('/customers', validate({ query: schemas.customerQuerySchema }), billing.customers);
router.get('/customers/lookup', validate({ query: schemas.customerQuerySchema }), billing.lookup);
router.post('/customers', validate({ body: schemas.customerCreateSchema }), billing.createCustomer);
router.get('/invoices', validate({ query: schemas.invoiceQuerySchema }), billing.invoices);
router.post('/invoices', validate({ body: schemas.invoiceCreateSchema }), billing.createInvoice);
router.get('/invoices/:id', billing.invoice);
router.post('/invoices/:id/return', validate({ body: schemas.returnSchema }), billing.returnInvoice);
router.post('/invoices/:id/whatsapp', billing.whatsapp);
router.get('/held', billing.held);
router.post('/held', validate({ body: schemas.holdSchema }), billing.hold);
router.post('/held/:id/resume', billing.resume);
router.delete('/held/:id', billing.discard);
router.get('/sold-out', validate({ query: schemas.productQuerySchema }), billing.soldOut);
router.post('/products/:id/restock', validate({ body: schemas.restockSchema }), billing.restock);
router.get('/summary/today', billing.summary);

module.exports = router;
