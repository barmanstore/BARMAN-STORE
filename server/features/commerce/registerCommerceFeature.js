const { registerDistributorRoutes } = require('./distributorRoutes');
const { registerSupplierRoutes } = require('./supplierRoutes');
const { registerCommerceRoutes } = require('./commerceRoutes');

const registerCommerceFeature = (deps = {}) => {
  registerDistributorRoutes(deps);
  registerSupplierRoutes(deps);
  registerCommerceRoutes(deps);
};

module.exports = { registerCommerceFeature };
