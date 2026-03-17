const createOrderFlagUtils = ({
  getPurchaseOrderLifecycleStatus,
  normalizeTransactionDate,
  PO_LIFECYCLE_CANCELLED,
  PO_LIFECYCLE_CLOSED,
} = {}) => {
  const hasOrderBeenReceived = (order = {}) => {
    if (String(order?.status || '').trim().toLowerCase() === 'received') return true;
    if (order?.received_at) return true;
    const itemsForOrder = Array.isArray(order?.items) ? order.items : [];
    if (!itemsForOrder.length) return false;
    return itemsForOrder.every((item) => Number(item?.received_quantity || 0) >= Number(item?.quantity || 0));
  };

  const isOpenOrder = (order) => {
    const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
    return lifecycleStatus !== PO_LIFECYCLE_CANCELLED && lifecycleStatus !== PO_LIFECYCLE_CLOSED;
  };

  const isDeliveryPending = (order, todayKey) => {
    if (!isOpenOrder(order)) return false;
    if (hasOrderBeenReceived(order)) return false;
    if (!order.expected_delivery) return false;
    const expectedDate = normalizeTransactionDate(order.expected_delivery);
    return Boolean(expectedDate) && expectedDate <= todayKey;
  };

  return {
    hasOrderBeenReceived,
    isOpenOrder,
    isDeliveryPending,
  };
};

module.exports = { createOrderFlagUtils };
