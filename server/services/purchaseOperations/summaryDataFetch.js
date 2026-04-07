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
    const products = await queries.fetchProducts();
    const distributors = await queries.fetchDistributors(filters.distributorIdFilter);
    const suppliers = await queries.fetchSuppliers(filters.distributorIdFilter);
    const orders = await queries.fetchOrders(filters.distributorIdFilter);
    const payments = await queries.fetchPayments(filters.distributorIdFilter);
    const items = await queries.fetchItems(filters.distributorIdFilter);
    const ledgerBalances = await queries.fetchLedgerBalances(filters.distributorIdFilter);
    const supplierVisits = await queries.fetchSupplierVisits({
      distributorIdFilter: filters.distributorIdFilter,
      startDate: filters.todayKey,
      endDate: filters.boardEndKey,
    });

    return {
      ...filters,
      products,
      distributors,
      suppliers,
      orders,
      payments,
      items,
      ledgerBalances,
      supplierVisits,
    };
  };

  return { fetchPurchaseOperationsSummaryData };
};

module.exports = { createPurchaseOperationsSummaryDataFetch };
