const createOrderAnchorUtils = ({ normalizeTransactionDate }) => {
  const getEffectivePurchaseDueDateKey = (order = {}, fallbackDate = null) => (
    normalizeTransactionDate(
      order.strict_due_date
      || order.payment_due_date
      || order.expected_delivery
      || order.received_at
      || order.confirmed_at
      || order.created_at
      || fallbackDate
    ) || normalizeTransactionDate(fallbackDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10)
  );

  const getPurchaseOrderAnchorDateKey = (order = {}) => (
    normalizeTransactionDate(
      order.planned_order_date
      || order.created_at
      || order.expected_delivery
      || order.received_at
      || order.confirmed_at
    )
  );

  const getPurchaseOrderDeliveryDateKey = (order = {}) => (
    normalizeTransactionDate(order.received_at || order.expected_delivery || null)
  );

  const getPurchaseOrderPaymentAnchorDateKey = (order = {}) => (
    normalizeTransactionDate(
      order.received_at
      || order.confirmed_at
      || order.planned_order_date
      || order.expected_delivery
      || order.created_at
    )
  );

  return {
    getEffectivePurchaseDueDateKey,
    getPurchaseOrderAnchorDateKey,
    getPurchaseOrderDeliveryDateKey,
    getPurchaseOrderPaymentAnchorDateKey,
  };
};

module.exports = { createOrderAnchorUtils };
