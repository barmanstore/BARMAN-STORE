const buildEnrichedOrders = ({
  orders,
  itemsByOrderId,
  paymentsByOrderId,
  getPurchaseOrderLifecycleStatus,
  normalizePoPaymentStatus,
  PO_PAYMENT_UNPAID,
  derivePurchaseNextAction,
} = {}) => {
  const enrichedOrders = (orders || []).map((order) => ({
    ...order,
    items: itemsByOrderId.get(Number(order.id || 0)) || [],
    payments: paymentsByOrderId.get(Number(order.id || 0)) || [],
    po_status: getPurchaseOrderLifecycleStatus(order),
    payment_status: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
    balance_due: Math.max(0, Number(order.balance_due || 0)),
    next_action: derivePurchaseNextAction({
      ...order,
      items: itemsByOrderId.get(Number(order.id || 0)) || [],
    }),
  }));
  const orderById = new Map(enrichedOrders.map((order) => [Number(order.id || 0), order]));
  return { enrichedOrders, orderById };
};

module.exports = { buildEnrichedOrders };
