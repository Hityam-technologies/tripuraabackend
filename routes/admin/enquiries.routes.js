const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { enquiryQuerySchema, statusSchema, noteSchema } = require('../../validators/enquiry.schema');
const enquiries = require('../../controllers/admin/enquiries.controller');

const router = Router();
router.get('/export', enquiries.exportEnquiries);
router.get('/', validate({ query: enquiryQuerySchema }), enquiries.listEnquiries);
router.get('/:id', enquiries.getEnquiry);
router.put('/:id/status', validate({ body: statusSchema }), enquiries.enquiryStatus);
router.post('/:id/notes', validate({ body: noteSchema }), enquiries.enquiryNote);
module.exports = router;
