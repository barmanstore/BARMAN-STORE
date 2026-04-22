const { registerPurchaseOrdersRoutes } = require('./routes/purchaseOrdersRoutes');
const { registerPurchaseOperationsRoutes } = require('./routes/purchaseOperationsRoutes');
const { registerPurchaseReturnsRoutes } = require('./routes/purchaseReturnsRoutes');
const { registerStockRoutes } = require('./routes/stockRoutes');
const { registerInsightsRoutes } = require('./routes/insightsRoutes');
const { registerOffersRoutes } = require('./routes/offersRoutes');

const registerCommerceRoutes = (deps) => {
  registerPurchaseOrdersRoutes(deps);
  registerPurchaseOperationsRoutes(deps);
  registerPurchaseReturnsRoutes(deps);
  registerStockRoutes(deps);
  registerInsightsRoutes(deps);
  registerOffersRoutes(deps);
};

module.exports = { registerCommerceRoutes };
