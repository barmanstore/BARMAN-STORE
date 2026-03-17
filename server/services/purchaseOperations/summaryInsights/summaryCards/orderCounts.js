const buildOrderCounts = ({
  openOrders,
  isDeliveryPending,
  getPurchaseOrderLifecycleStatus,
  PO_LIFECYCLE_PREPARED,
  PO_LIFECYCLE_SENT,
  PO_LIFECYCLE_REVISED,
  PO_LIFECYCLE_FULLY_PAID,
} = {}) => {
  const waitingBillCount = (openOrders || []).filter((order) => {
    const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
    return (lifecycleStatus === PO_LIFECYCLE_SENT || lifecycleStatus === PO_LIFECYCLE_REVISED || lifecycleStatus === PO_LIFECYCLE_PREPARED)
      && !String(order.bill_number || order.invoice_number || '').trim();
  }).length;
  const waitingDeliveryCount = (openOrders || []).filter(isDeliveryPending).length;
  const closeReadyCount = (openOrders || []).filter(
    (order) => getPurchaseOrderLifecycleStatus(order) === PO_LIFECYCLE_FULLY_PAID
  ).length;

  return {
    waitingBillCount,
    waitingDeliveryCount,
    closeReadyCount,
  };
};

module.exports = { buildOrderCounts };
