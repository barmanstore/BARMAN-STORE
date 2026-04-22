const collectDistributorOrderStats = ({
  completedOrders,
  paymentsByOrderId,
  normalizeTransactionDate,
  getPurchaseOrderPaymentAnchorDateKey,
  getPurchaseOrderDeliveryDateKey,
  getPurchaseOrderAnchorDateKey,
  getDaysBetweenDateKeys,
  pickLatestDateKey,
} = {}) => {
  const paymentLagDays = [];
  const deliveryLagDays = [];
  const paymentDateKeys = [];
  const deliveryDateKeys = [];
  const productCounts = new Map();
  const suggestionMap = new Map();

  completedOrders.forEach((order) => {
    const orderPayments = paymentsByOrderId.get(Number(order.id || 0)) || [];
    const orderPaymentDates = orderPayments
      .map((payment) => normalizeTransactionDate(payment.transaction_date || payment.created_at))
      .filter(Boolean);
    if (orderPaymentDates.length > 0) {
      paymentDateKeys.push(...orderPaymentDates);
      const anchorDate = getPurchaseOrderPaymentAnchorDateKey(order);
      const lastPaymentDate = pickLatestDateKey(orderPaymentDates);
      const lagDays =
        anchorDate && lastPaymentDate ? getDaysBetweenDateKeys(anchorDate, lastPaymentDate) : null;
      if (Number.isFinite(lagDays) && lagDays >= 0) {
        paymentLagDays.push(lagDays);
      }
    }
    const deliveryDate = getPurchaseOrderDeliveryDateKey(order);
    if (deliveryDate) {
      deliveryDateKeys.push(deliveryDate);
      const anchorDate = getPurchaseOrderAnchorDateKey(order);
      const leadDays =
        anchorDate && deliveryDate ? getDaysBetweenDateKeys(anchorDate, deliveryDate) : null;
      if (Number.isFinite(leadDays) && leadDays >= 0) {
        deliveryLagDays.push(leadDays);
      }
    }
    (order.items || []).forEach((item) => {
      const key = String(item.product_name || item.product_id || '').trim();
      if (!key) return;
      productCounts.set(key, (productCounts.get(key) || 0) + 1);
      const suggestionKey = String(item.product_id || item.product_name || '')
        .trim()
        .toLowerCase();
      const existing = suggestionMap.get(suggestionKey) || {
        product_id: item.product_id ? Number(item.product_id) : null,
        product_name: item.product_name || 'Unknown',
        quantity_total: 0,
        quantity_count: 0,
        latest_created_at: '',
        uom: item.uom || 'pcs',
        rate: Number(item.rate ?? item.unit_price ?? 0),
        gst_rate: Number(item.gst_rate || 0),
        discount_type: item.discount_type || 'percent',
        discount_value: Number(item.discount_value || 0),
      };
      const orderCreatedAt = String(
        order.created_at || order.planned_order_date || order.expected_delivery || ''
      );
      const currentQuantity = Math.max(0, Number(item.quantity || 0));
      const nextRecord = {
        ...existing,
        quantity_total: Number(existing.quantity_total || 0) + currentQuantity,
        quantity_count: Number(existing.quantity_count || 0) + 1,
      };
      if (!existing.latest_created_at || orderCreatedAt > existing.latest_created_at) {
        nextRecord.latest_created_at = orderCreatedAt;
        nextRecord.uom = item.uom || existing.uom || 'pcs';
        nextRecord.rate = Number(item.rate ?? item.unit_price ?? existing.rate ?? 0);
        nextRecord.gst_rate = Number(item.gst_rate ?? existing.gst_rate ?? 0);
        nextRecord.discount_type = item.discount_type || existing.discount_type || 'percent';
        nextRecord.discount_value = Number(item.discount_value ?? existing.discount_value ?? 0);
      }
      suggestionMap.set(suggestionKey, nextRecord);
    });
  });

  return {
    paymentLagDays,
    deliveryLagDays,
    paymentDateKeys,
    deliveryDateKeys,
    productCounts,
    suggestionMap,
  };
};

module.exports = { collectDistributorOrderStats };
