const { registerCreditLedgerListRoutes } = require('./creditLedger/creditLedgerList');
const { registerCreditLedgerAdjustmentsRoutes } = require('./creditLedger/creditLedgerAdjustments');
const { registerCreditLedgerReportsRoutes } = require('./creditLedger/creditLedgerReports');
const {
  registerCreditPaymentIntelligenceJobRoutes,
} = require('./creditLedger/creditPaymentIntelligenceJob');
const {
  registerCreditLedgerWhatsAppLogRoutes,
} = require('./creditLedger/creditLedgerWhatsAppLogs');

const registerCreditLedgerRoutes = (deps) => {
  registerCreditLedgerListRoutes(deps);
  registerCreditLedgerAdjustmentsRoutes(deps);
  registerCreditLedgerReportsRoutes(deps);
  registerCreditPaymentIntelligenceJobRoutes(deps);
  registerCreditLedgerWhatsAppLogRoutes(deps);
};

module.exports = { registerCreditLedgerRoutes };
