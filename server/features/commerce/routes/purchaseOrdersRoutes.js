const { registerPurchaseOrdersListRoutes } = require('./purchaseOrders/purchaseOrdersList');
const { registerPurchaseOrdersDetailsRoutes } = require('./purchaseOrders/purchaseOrdersDetails');
const { registerPurchaseOrdersStatusRoutes } = require('./purchaseOrders/purchaseOrdersStatus');
const { registerPurchaseOrdersPaymentsRoutes } = require('./purchaseOrders/purchaseOrdersPayments');
const { registerPurchaseOrdersReceiveRoutes } = require('./purchaseOrders/purchaseOrdersReceive');
const { registerPurchaseOrdersDeleteRoutes } = require('./purchaseOrders/purchaseOrdersDelete');

const registerPurchaseOrdersRoutes = (deps) => {
  registerPurchaseOrdersListRoutes(deps);
  registerPurchaseOrdersDetailsRoutes(deps);
  registerPurchaseOrdersStatusRoutes(deps);
  registerPurchaseOrdersPaymentsRoutes(deps);
  registerPurchaseOrdersReceiveRoutes(deps);
  registerPurchaseOrdersDeleteRoutes(deps);
};

module.exports = { registerPurchaseOrdersRoutes };
