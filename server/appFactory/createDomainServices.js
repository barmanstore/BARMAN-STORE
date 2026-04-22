const { createCoreDomainServices } = require('./domainServices/core');
const { createNotificationServices } = require('./domainServices/notifications');
const { createPhoneChangeServices } = require('./domainServices/phoneChange');
const { createPurchaseOperationsServices } = require('./domainServices/purchaseOperations');
const { createRetentionServices } = require('./domainServices/retention');
const { createAuthServices } = require('./domainServices/auth');
const { createCatalogServices } = require('./domainServices/catalog');

const createDomainServices = ({ core }) => {
  const domainCore = createCoreDomainServices({ core });
  const notifications = createNotificationServices({ core, domainCore });
  const phoneChangeService = createPhoneChangeServices({
    core,
    notificationUtils: notifications.notificationUtils,
  });
  const purchaseOperations = createPurchaseOperationsServices({
    core,
    domainCore,
    notificationUtils: notifications.notificationUtils,
  });
  const catalog = createCatalogServices({ core, domainCore });
  const retention = createRetentionServices({ core });
  const auth = createAuthServices({ core });

  return {
    ...domainCore,
    ...notifications,
    phoneChangeService,
    purchaseOperations,
    ...catalog,
    ...retention,
    ...auth,
  };
};

module.exports = { createDomainServices };
