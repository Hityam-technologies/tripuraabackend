const admin = require('./dashboard.controller');
module.exports = {
  listUsers: admin.listUsers,
  getUser: admin.getUser,
  blockUser: admin.blockUser,
  unblockUser: admin.unblockUser,
};
