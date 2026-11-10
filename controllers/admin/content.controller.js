const admin = require('./dashboard.controller');
module.exports = {
  getHero: admin.getHero,
  putHero: admin.putHero,
  getStore: admin.getStore,
  putStore: admin.putStore,
  getSupport: admin.getSupport,
  putSupport: admin.putSupport,
  getFaq: admin.getFaq,
  putFaq: admin.putFaq,
  getLegal: admin.getLegal,
  putLegal: admin.putLegal,
};
