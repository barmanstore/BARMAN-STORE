const createOrderFlagUtils = ({
  getPurchaseOrderLifecycleStatus,
  normalizeTransactionDate,
  PO_LIFECYCLE_CANCELLED,
  PO_LIFECYCLE_CLOSED,
} = {}) => {
  const isTruthyFlag = (value = false) => {
    if (value === true || value === 1) return true;
    if (value === false || value === 0 || value === null || value === undefined || value === '')
      return false;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return false;
    if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;
    return Boolean(value);
  };

  const hasOrderBeenReceived = (order = {}) => {
    if (isTruthyFlag(order?.delivered)) return true;
    if (
      String(order?.status || '')
        .trim()
        .toLowerCase() === 'received'
    )
      return true;
    if (order?.received_at) return true;
    const itemsForOrder = Array.isArray(order?.items) ? order.items : [];
    if (!itemsForOrder.length) return false;
    return itemsForOrder.every(
      (item) => Number(item?.received_quantity || 0) >= Number(item?.quantity || 0)
    );
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
