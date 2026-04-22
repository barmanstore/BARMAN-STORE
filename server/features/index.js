const { registerAuthFeature } = require('./auth');
const { registerCommunicationFeature } = require('./communication');
const { registerCatalogFeature } = require('./catalog');
const { registerSalesFeature } = require('./sales');
const { registerCommerceFeature } = require('./commerce');
const { registerCreditFeature } = require('./credits');

module.exports = {
  registerAuthFeature,
  registerCommunicationFeature,
  registerCatalogFeature,
  registerSalesFeature,
  registerCommerceFeature,
  registerCreditFeature,
};
