const { registerDistributorRoutes } = require('./distributorRoutes');
const { registerCommerceRoutes } = require('./commerceRoutes');

const registerCommerceFeature = (deps = {}) => {
  registerDistributorRoutes(deps);
  registerCommerceRoutes(deps);
};

module.exports = { registerCommerceFeature };
