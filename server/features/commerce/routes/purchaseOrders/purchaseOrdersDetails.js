const { registerPurchaseOrdersReadRoutes } = require('./purchaseOrdersRead');
const { registerPurchaseOrdersWhatsAppRoutes } = require('./purchaseOrdersWhatsApp');
const { registerPurchaseOrdersEditRoutes } = require('./purchaseOrdersEdit');

const registerPurchaseOrdersDetailsRoutes = (deps) => {
  registerPurchaseOrdersReadRoutes(deps);
  registerPurchaseOrdersWhatsAppRoutes(deps);
  registerPurchaseOrdersEditRoutes(deps);
};

module.exports = { registerPurchaseOrdersDetailsRoutes };
