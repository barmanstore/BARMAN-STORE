const { registerOrderRoutes } = require('./orderRoutes');
const { registerBillingRoutes } = require('./billingRoutes');

const registerSalesFeature = (deps = {}) => {
  registerOrderRoutes(deps);
  registerBillingRoutes(deps);
};

module.exports = { registerSalesFeature };
