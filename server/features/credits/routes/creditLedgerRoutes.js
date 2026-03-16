const { registerCreditLedgerListRoutes } = require('./creditLedger/creditLedgerList');
const { registerCreditLedgerAdjustmentsRoutes } = require('./creditLedger/creditLedgerAdjustments');
const { registerCreditLedgerReportsRoutes } = require('./creditLedger/creditLedgerReports');

const registerCreditLedgerRoutes = (deps) => {
  registerCreditLedgerListRoutes(deps);
  registerCreditLedgerAdjustmentsRoutes(deps);
  registerCreditLedgerReportsRoutes(deps);
};

module.exports = { registerCreditLedgerRoutes };
