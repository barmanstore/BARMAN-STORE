const { registerProductInsightsListRoutes } = require('./productInsightsList');
const { registerProductInsightsDetailRoutes } = require('./productInsightsDetail');

const registerProductInsightsRoutes = (deps) => {
  registerProductInsightsListRoutes(deps);
  registerProductInsightsDetailRoutes(deps);
};

module.exports = { registerProductInsightsRoutes };
