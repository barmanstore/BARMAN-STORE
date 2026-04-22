const buildEnrichedOrders = ({
  orders,
  items,
  getPurchaseOrderLifecycleStatus,
  normalizePoPaymentStatus,
  PO_PAYMENT_UNPAID,
  derivePurchaseNextAction,
} = {}) => {
  const itemsByOrderId = new Map();
  for (const item of items || []) {
    const key = Number(item.order_id || 0);
    const list = itemsByOrderId.get(key) || [];
    list.push(item);
    itemsByOrderId.set(key, list);
  }

  const enrichedOrders = (orders || []).map((order) => ({
    ...order,
    items: itemsByOrderId.get(Number(order.id || 0)) || [],
    po_status: getPurchaseOrderLifecycleStatus(order),
    payment_status: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
    balance_due: Math.max(0, Number(order.balance_due || 0)),
    next_action: derivePurchaseNextAction({
      ...order,
      items: itemsByOrderId.get(Number(order.id || 0)) || [],
    }),
  }));

  return {
    itemsByOrderId,
    enrichedOrders,
  };
};

module.exports = { buildEnrichedOrders };
