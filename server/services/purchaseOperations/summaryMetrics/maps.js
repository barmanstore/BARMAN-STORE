const buildItemsByOrderId = (items = []) => {
  const itemsByOrderId = new Map();
  for (const item of items || []) {
    const key = Number(item.order_id || 0);
    const list = itemsByOrderId.get(key) || [];
    list.push(item);
    itemsByOrderId.set(key, list);
  }
  return itemsByOrderId;
};

const buildPaymentsByOrderId = (payments = []) => {
  const paymentsByOrderId = new Map();
  for (const payment of payments || []) {
    const key = Number(payment.purchase_order_id || 0);
    const list = paymentsByOrderId.get(key) || [];
    list.push(payment);
    paymentsByOrderId.set(key, list);
  }
  return paymentsByOrderId;
};

const buildLedgerBalanceByDistributor = (ledgerBalances = []) => {
  const ledgerBalanceByDistributor = new Map();
  for (const entry of ledgerBalances || []) {
    const key = Number(entry.distributor_id || 0);
    if (!key || ledgerBalanceByDistributor.has(key)) continue;
    ledgerBalanceByDistributor.set(key, Number(entry.balance || 0));
  }
  return ledgerBalanceByDistributor;
};

module.exports = {
  buildItemsByOrderId,
  buildPaymentsByOrderId,
  buildLedgerBalanceByDistributor,
};
