const admin = require('./dashboard.controller');
module.exports = { looks: admin.looks, flagLook: admin.flagLook, deleteLook: admin.deleteLook };
