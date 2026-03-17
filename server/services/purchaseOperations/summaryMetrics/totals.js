const buildPaidTodayAmount = ({ payments, todayKey, normalizeTransactionDate } = {}) => (payments || []).reduce(
  (sum, payment) => {
    const paymentDate = normalizeTransactionDate(payment.transaction_date || payment.created_at);
    if (paymentDate !== todayKey) return sum;
    return sum + Number(payment.amount || 0);
  },
  0
);

const buildOrdersByDistributor = (orders = []) => {
  const ordersByDistributor = new Map();
  for (const order of orders) {
    const key = Number(order.distributor_id || 0);
    const list = ordersByDistributor.get(key) || [];
    list.push(order);
    ordersByDistributor.set(key, list);
  }
  return ordersByDistributor;
};

module.exports = { buildPaidTodayAmount, buildOrdersByDistributor };
