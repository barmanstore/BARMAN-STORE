const { registerNotifyRoutes } = require('./routes/notifyRoutes');
const { registerMediaProxyRoutes } = require('./routes/mediaProxyRoutes');
const { registerAnalyticsRoutes } = require('./routes/analyticsRoutes');
const { registerAdminNotificationRoutes } = require('./routes/adminNotificationRoutes');
const { registerUserNotificationRoutes } = require('./routes/userNotificationRoutes');
const { registerNotificationPurgeRoutes } = require('./routes/notificationPurgeRoutes');
const {
  registerPurchaseOperationNotificationRoutes,
} = require('./routes/purchaseOperationNotificationRoutes');
const { registerMessageRecipientRoutes } = require('./routes/messageRecipientRoutes');
const { registerMessageToAdminRoutes } = require('./routes/messageToAdminRoutes');
const { registerMessageToCustomerRoutes } = require('./routes/messageToCustomerRoutes');
const { registerCashbookRoutes } = require('./routes/cashbookRoutes');

const registerCommunicationRoutes = (deps) => {
  registerNotifyRoutes(deps);
  registerMediaProxyRoutes(deps);
  registerAnalyticsRoutes(deps);
  registerAdminNotificationRoutes(deps);
  registerUserNotificationRoutes(deps);
  registerNotificationPurgeRoutes(deps);
  registerPurchaseOperationNotificationRoutes(deps);
  registerMessageRecipientRoutes(deps);
  registerMessageToAdminRoutes(deps);
  registerMessageToCustomerRoutes(deps);
  registerCashbookRoutes(deps);
};

module.exports = { registerCommunicationRoutes };
