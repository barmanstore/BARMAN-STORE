const { registerRecommendationCreditRoutes } = require('./recommendationCreditRoutes');

const registerCreditFeature = (deps = {}) => {
  registerRecommendationCreditRoutes(deps);
};

module.exports = { registerCreditFeature };
