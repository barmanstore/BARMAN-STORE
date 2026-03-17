const { registerPurchaseOrdersListReadRoutes } = require('./purchaseOrdersListRead');
const { registerPurchaseOrdersListCreateRoutes } = require('./purchaseOrdersListCreate');

const registerPurchaseOrdersListRoutes = (deps) => {
  registerPurchaseOrdersListReadRoutes(deps);
  registerPurchaseOrdersListCreateRoutes(deps);
};

module.exports = { registerPurchaseOrdersListRoutes };
