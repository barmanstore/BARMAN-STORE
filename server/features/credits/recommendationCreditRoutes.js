const { registerRecommendationRoutes } = require('./routes/recommendationsRoutes');
const { registerCreditIssuesRoutes } = require('./routes/creditIssuesRoutes');
const { registerCreditLedgerRoutes } = require('./routes/creditLedgerRoutes');

const registerRecommendationCreditRoutes = (deps) => {
  registerRecommendationRoutes(deps);
  registerCreditIssuesRoutes(deps);
  registerCreditLedgerRoutes(deps);
};

module.exports = { registerRecommendationCreditRoutes };
