const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { memoryUpload, prepareProducts } = require('../../middleware/upload');
const {
  adminSareeQuery,
  sareeWriteSchema,
  bulkSchema,
  imageOrderSchema,
  imageUrlsSchema,
} = require('../../validators/saree.schema');
const sarees = require('../../controllers/admin/sarees.controller');

const router = Router();
router.get('/', validate({ query: adminSareeQuery }), sarees.listSarees);
router.post('/bulk', validate({ body: bulkSchema }), sarees.bulkSarees);
router.get('/:id', sarees.getSaree);
router.post('/', validate({ body: sareeWriteSchema }), sarees.createSaree);
router.put('/:id', validate({ body: sareeWriteSchema.partial() }), sarees.updateSaree);
router.delete('/:id', sarees.deleteSaree);
router.post('/:id/duplicate', sarees.duplicateSaree);
router.post('/:id/images', memoryUpload('images', 8), prepareProducts, sarees.addImages);
router.post('/:id/images/urls', validate({ body: imageUrlsSchema }), sarees.addImageUrls);
router.put('/:id/images/order', validate({ body: imageOrderSchema }), sarees.reorderImages);
router.delete('/:id/images/:imageId', sarees.deleteImage);
module.exports = router;
