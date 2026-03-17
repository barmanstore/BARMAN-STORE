const { buildSummaryFilters } = require('./summaryDataFetch/filters');
const { createSummaryDataQueries } = require('./summaryDataFetch/queries');

const createPurchaseOperationsSummaryDataFetch = (deps) => {
  const {
    dbAllAsync,
    normalizeTransactionDate,
    addDaysToDateKey,
    resolveRollupRange,
  } = deps;

  const queries = createSummaryDataQueries({ dbAllAsync });

  const fetchPurchaseOperationsSummaryData = async (req) => {
    const filters = buildSummaryFilters({
      req,
      normalizeTransactionDate,
      addDaysToDateKey,
      resolveRollupRange,
    });
    const distributors = await queries.fetchDistributors(filters.distributorIdFilter);
    const orders = await queries.fetchOrders(filters.distributorIdFilter);
    const payments = await queries.fetchPayments(filters.distributorIdFilter);
    const items = await queries.fetchItems(filters.distributorIdFilter);
    const ledgerBalances = await queries.fetchLedgerBalances(filters.distributorIdFilter);

    return {
      ...filters,
      distributors,
      orders,
      payments,
      items,
      ledgerBalances,
    };
  };

  return { fetchPurchaseOperationsSummaryData };
};

module.exports = { createPurchaseOperationsSummaryDataFetch };
