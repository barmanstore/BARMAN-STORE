const {
  registerPurchaseReturnsListRoutes,
  registerPurchaseReturnsDetailRoutes,
  registerPurchaseReturnsCreateRoutes,
  registerPurchaseReturnsUpdateRoutes,
  registerPurchaseReturnsDeleteRoutes,
} = require('./purchaseReturns');

const registerPurchaseReturnsRoutes = (deps) => {
  registerPurchaseReturnsListRoutes(deps);
  registerPurchaseReturnsDetailRoutes(deps);
  registerPurchaseReturnsCreateRoutes(deps);
  registerPurchaseReturnsUpdateRoutes(deps);
  registerPurchaseReturnsDeleteRoutes(deps);
};

module.exports = { registerPurchaseReturnsRoutes };
