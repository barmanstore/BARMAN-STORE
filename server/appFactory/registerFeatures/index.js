const { registerAppFeatures } = require('../../core/bootstrap/features');
const { buildBaseDeps } = require('./baseDeps');
const { buildAuthDeps } = require('./authDeps');
const { buildCatalogDeps } = require('./catalogDeps');
const { buildSalesDeps } = require('./salesDeps');
const { buildCreditDeps } = require('./creditDeps');
const { buildPurchaseDeps } = require('./purchaseDeps');

const registerFeatures = ({ core, domain }) => {
  registerAppFeatures({
    ...buildBaseDeps({ core, domain }),
    ...buildAuthDeps({ core, domain }),
    ...buildCatalogDeps({ core }),
    ...buildSalesDeps({ domain }),
    ...buildCreditDeps({ core, domain }),
    ...buildPurchaseDeps({ core, domain }),
  });
};

module.exports = { registerFeatures };
