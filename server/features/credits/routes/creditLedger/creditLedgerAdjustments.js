const { registerCreditLedgerCreateRoutes } = require('./adjustments/createRoutes');
const { registerCreditLedgerUpdateRoutes } = require('./adjustments/updateRoutes');
const { registerCreditLedgerDeleteRoutes } = require('./adjustments/deleteRoutes');

const registerCreditLedgerAdjustmentsRoutes = (deps) => {
  registerCreditLedgerCreateRoutes(deps);
  registerCreditLedgerUpdateRoutes(deps);
  registerCreditLedgerDeleteRoutes(deps);
};

module.exports = { registerCreditLedgerAdjustmentsRoutes };
