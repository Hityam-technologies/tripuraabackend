const { Router } = require('express');
const { validate } = require('../../middleware/validate');
const { categoryWriteSchema, categoryReorderSchema } = require('../../validators/category.schema');
const categories = require('../../controllers/admin/categories.controller');

const router = Router();
router.get('/', categories.listCategories);
router.put('/reorder', validate({ body: categoryReorderSchema }), categories.reorderCategories);
router.post('/', validate({ body: categoryWriteSchema }), categories.createCategory);
router.put('/:id', validate({ body: categoryWriteSchema.partial() }), categories.updateCategory);
router.delete('/:id', categories.deleteCategory);
module.exports = router;
