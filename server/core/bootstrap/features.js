const { registerAuthFeatureBootstrap } = require('./featureRegistrars/authFeature');
const {
  registerCommunicationFeatureBootstrap,
} = require('./featureRegistrars/communicationFeature');
const { registerCatalogFeatureBootstrap } = require('./featureRegistrars/catalogFeature');
const { registerSalesFeatureBootstrap } = require('./featureRegistrars/salesFeature');
const { registerCreditFeatureBootstrap } = require('./featureRegistrars/creditFeature');
const { registerCommerceFeatureBootstrap } = require('./featureRegistrars/commerceFeature');

const registerAppFeatures = (deps) => {
  registerAuthFeatureBootstrap(deps);
  registerCommunicationFeatureBootstrap(deps);
  registerCatalogFeatureBootstrap(deps);
  registerSalesFeatureBootstrap(deps);
  registerCreditFeatureBootstrap(deps);
  registerCommerceFeatureBootstrap(deps);
};

module.exports = { registerAppFeatures };
