const { registerCreditLedgerListRoutes } = require('./creditLedger/creditLedgerList');
const { registerCreditLedgerAdjustmentsRoutes } = require('./creditLedger/creditLedgerAdjustments');
const { registerCreditLedgerReportsRoutes } = require('./creditLedger/creditLedgerReports');
const { registerCreditPaymentIntelligenceJobRoutes } = require('./creditLedger/creditPaymentIntelligenceJob');

const registerCreditLedgerRoutes = (deps) => {
  registerCreditLedgerListRoutes(deps);
  registerCreditLedgerAdjustmentsRoutes(deps);
  registerCreditLedgerReportsRoutes(deps);
  registerCreditPaymentIntelligenceJobRoutes(deps);
};

module.exports = { registerCreditLedgerRoutes };
