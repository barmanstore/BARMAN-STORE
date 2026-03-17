const { registerPurchaseReturnsListRoutes } = require('./listRoutes');
const { registerPurchaseReturnsDetailRoutes } = require('./detailRoutes');
const { registerPurchaseReturnsCreateRoutes } = require('./createRoutes');
const { registerPurchaseReturnsUpdateRoutes } = require('./updateRoutes');
const { registerPurchaseReturnsDeleteRoutes } = require('./deleteRoutes');

module.exports = {
  registerPurchaseReturnsListRoutes,
  registerPurchaseReturnsDetailRoutes,
  registerPurchaseReturnsCreateRoutes,
  registerPurchaseReturnsUpdateRoutes,
  registerPurchaseReturnsDeleteRoutes,
};
