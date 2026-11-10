const admin = require('./dashboard.controller');
module.exports = {
  listEnquiries: admin.listEnquiries,
  getEnquiry: admin.getEnquiry,
  enquiryStatus: admin.enquiryStatus,
  enquiryNote: admin.enquiryNote,
  exportEnquiries: admin.exportEnquiries,
};
