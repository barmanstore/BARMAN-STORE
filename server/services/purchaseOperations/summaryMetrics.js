const { buildItemsByOrderId, buildPaymentsByOrderId, buildLedgerBalanceByDistributor } = require('./summaryMetrics/maps');
const { buildEnrichedOrders } = require('./summaryMetrics/enrichOrders');
const { createOrderFlagUtils } = require('./summaryMetrics/orderFlags');
const { buildPayables, buildPayablesByDistributor } = require('./summaryMetrics/payables');
const { buildPaidTodayAmount, buildOrdersByDistributor } = require('./summaryMetrics/totals');

const createPurchaseOperationsSummaryMetrics = (deps) => {
  const {
    getPurchaseOrderLifecycleStatus,
    getEffectivePurchaseDueDateKey,
    getDaysBetweenDateKeys,
    normalizePoPaymentStatus,
    normalizeTransactionDate,
    derivePurchaseNextAction,
    PO_LIFECYCLE_CANCELLED,
    PO_LIFECYCLE_CLOSED,
    PO_PAYMENT_UNPAID,
  } = deps;

  const buildPurchaseOperationsMetrics = (baseData) => {
    const {
      todayKey,
      orders,
      payments,
      items,
      ledgerBalances,
    } = baseData;

    const itemsByOrderId = buildItemsByOrderId(items);
    const paymentsByOrderId = buildPaymentsByOrderId(payments);
    const ledgerBalanceByDistributor = buildLedgerBalanceByDistributor(ledgerBalances);

    const { enrichedOrders, orderById } = buildEnrichedOrders({
      orders,
      itemsByOrderId,
      paymentsByOrderId,
      getPurchaseOrderLifecycleStatus,
      normalizePoPaymentStatus,
      PO_PAYMENT_UNPAID,
      derivePurchaseNextAction,
    });

    const { isOpenOrder, isDeliveryPending } = createOrderFlagUtils({
      getPurchaseOrderLifecycleStatus,
      normalizeTransactionDate,
      PO_LIFECYCLE_CANCELLED,
      PO_LIFECYCLE_CLOSED,
    });
    const openOrders = enrichedOrders.filter(isOpenOrder);

    const payables = buildPayables({
      openOrders,
      todayKey,
      getEffectivePurchaseDueDateKey,
      getDaysBetweenDateKeys,
    });
    const payablesByDistributor = buildPayablesByDistributor(payables);

    const paidTodayAmount = buildPaidTodayAmount({ payments, todayKey, normalizeTransactionDate });
    const ordersByDistributor = buildOrdersByDistributor(enrichedOrders);

    return {
      itemsByOrderId,
      paymentsByOrderId,
      ledgerBalanceByDistributor,
      enrichedOrders,
      orderById,
      openOrders,
      payables,
      payablesByDistributor,
      ordersByDistributor,
      paidTodayAmount,
      isOpenOrder,
      isDeliveryPending,
    };
  };

  return { buildPurchaseOperationsMetrics };
};

module.exports = { createPurchaseOperationsSummaryMetrics };
