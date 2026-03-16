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

    const itemsByOrderId = new Map();
    for (const item of items) {
      const key = Number(item.order_id || 0);
      const list = itemsByOrderId.get(key) || [];
      list.push(item);
      itemsByOrderId.set(key, list);
    }
    const paymentsByOrderId = new Map();
    for (const payment of payments) {
      const key = Number(payment.purchase_order_id || 0);
      const list = paymentsByOrderId.get(key) || [];
      list.push(payment);
      paymentsByOrderId.set(key, list);
    }
    const ledgerBalanceByDistributor = new Map();
    for (const entry of ledgerBalances) {
      const key = Number(entry.distributor_id || 0);
      if (!key || ledgerBalanceByDistributor.has(key)) continue;
      ledgerBalanceByDistributor.set(key, Number(entry.balance || 0));
    }

    const enrichedOrders = orders.map((order) => ({
      ...order,
      items: itemsByOrderId.get(Number(order.id || 0)) || [],
      payments: paymentsByOrderId.get(Number(order.id || 0)) || [],
      po_status: getPurchaseOrderLifecycleStatus(order),
      payment_status: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
      balance_due: Math.max(0, Number(order.balance_due || 0)),
      next_action: derivePurchaseNextAction({ ...order, items: itemsByOrderId.get(Number(order.id || 0)) || [] }),
    }));
    const orderById = new Map(enrichedOrders.map((order) => [Number(order.id || 0), order]));

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
    const isDeliveryPending = (order) => {
      if (!isOpenOrder(order)) return false;
      if (hasOrderBeenReceived(order)) return false;
      if (!order.expected_delivery) return false;
      const expectedDate = normalizeTransactionDate(order.expected_delivery);
      return Boolean(expectedDate) && expectedDate <= todayKey;
    };
    const openOrders = enrichedOrders.filter(isOpenOrder);
    const payables = openOrders
      .filter((order) => Number(order.balance_due || 0) > 0)
      .map((order) => {
        const paymentDueDate = getEffectivePurchaseDueDateKey(order, todayKey);
        const daysUntilDue = getDaysBetweenDateKeys(todayKey, paymentDueDate);
        const overdueDays = paymentDueDate < todayKey ? Math.abs(getDaysBetweenDateKeys(paymentDueDate, todayKey) || 0) : 0;
        return {
          order_id: Number(order.id || 0),
          po_number: order.po_number,
          distributor_id: Number(order.distributor_id || 0),
          distributor_name: order.distributor_name || '-',
          balance_due: Number(order.balance_due || 0),
          payment_due_date: paymentDueDate,
          overdue_days: overdueDays,
          due_today: paymentDueDate === todayKey,
          days_until_due: daysUntilDue,
          payment_status: order.payment_status,
          po_status: order.po_status,
          next_action: order.next_action,
        };
      })
      .sort((a, b) => (b.overdue_days - a.overdue_days) || (a.days_until_due - b.days_until_due) || (b.balance_due - a.balance_due));

    const payablesByDistributor = new Map();
    for (const payable of payables) {
      const key = Number(payable.distributor_id || 0);
      const list = payablesByDistributor.get(key) || [];
      list.push(payable);
      payablesByDistributor.set(key, list);
    }

    const paidTodayAmount = payments.reduce((sum, payment) => {
      const paymentDate = normalizeTransactionDate(payment.transaction_date || payment.created_at);
      if (paymentDate !== todayKey) return sum;
      return sum + Number(payment.amount || 0);
    }, 0);

    const ordersByDistributor = new Map();
    for (const order of enrichedOrders) {
      const key = Number(order.distributor_id || 0);
      const list = ordersByDistributor.get(key) || [];
      list.push(order);
      ordersByDistributor.set(key, list);
    }

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
