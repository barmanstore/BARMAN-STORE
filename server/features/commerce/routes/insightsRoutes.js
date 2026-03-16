const { registerProductInsightsRoutes } = require('./insights/productInsights');
const { registerDistributorInsightsRoutes } = require('./insights/distributorInsights');
const { registerSupplierInsightsRoutes } = require('./insights/supplierInsights');

const registerInsightsRoutes = (deps) => {
  registerProductInsightsRoutes(deps);
  registerDistributorInsightsRoutes(deps);
  registerSupplierInsightsRoutes(deps);
};

module.exports = { registerInsightsRoutes };
