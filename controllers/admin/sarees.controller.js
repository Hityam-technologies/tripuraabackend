const admin = require('./dashboard.controller');
module.exports = {
  listSarees: admin.listSarees,
  getSaree: admin.getSaree,
  createSaree: admin.createSaree,
  updateSaree: admin.updateSaree,
  deleteSaree: admin.deleteSaree,
  duplicateSaree: admin.duplicateSaree,
  bulkSarees: admin.bulkSarees,
  addImages: admin.addImages,
  addImageUrls: admin.addImageUrls,
  reorderImages: admin.reorderImages,
  deleteImage: admin.deleteImage,
};
