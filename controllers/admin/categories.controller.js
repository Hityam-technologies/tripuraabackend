const admin = require('./dashboard.controller');
module.exports = {
  listCategories: admin.listCategories,
  createCategory: admin.createCategory,
  updateCategory: admin.updateCategory,
  deleteCategory: admin.deleteCategory,
  reorderCategories: admin.reorderCategories,
};
