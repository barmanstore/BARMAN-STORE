const buildPayables = ({
  openOrders,
  todayKey,
  getEffectivePurchaseDueDateKey,
  getDaysBetweenDateKeys,
} = {}) => openOrders
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

const buildPayablesByDistributor = (payables = []) => {
  const payablesByDistributor = new Map();
  for (const payable of payables) {
    const key = Number(payable.distributor_id || 0);
    const list = payablesByDistributor.get(key) || [];
    list.push(payable);
    payablesByDistributor.set(key, list);
  }
  return payablesByDistributor;
};

module.exports = { buildPayables, buildPayablesByDistributor };
