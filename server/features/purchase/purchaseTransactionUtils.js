const createPurchaseTransactionUtils = ({ buildCreditTransactionTimestamp } = {}) => {
  const buildPurchaseTransactionTimestamp = (transactionDate, referenceDate = null) => (
    buildCreditTransactionTimestamp(transactionDate, referenceDate)
  );

  return { buildPurchaseTransactionTimestamp };
};

module.exports = { createPurchaseTransactionUtils };
