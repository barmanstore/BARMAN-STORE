const computeOrderTotals = ({
  parsedItems,
  paymentMethod,
  normalizePaymentMethod,
  generateOrderNumber,
  ORDER_STATUS_ORDERED,
}) => {
  const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
  const subtotal = parsedItems.reduce((sum, item) => {
    const lineTotal = Number(item?.line_total);
    if (Number.isFinite(lineTotal)) return sum + lineTotal;
    return sum + Number(item?.price || 0) * Number(item?.quantity || 0);
  }, 0);
  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = subtotal + tax;
  const orderNumber = generateOrderNumber();
  const createdStatus = ORDER_STATUS_ORDERED;

  return {
    normalizedPaymentMethod,
    subtotal,
    tax,
    total,
    orderNumber,
    createdStatus,
  };
};

module.exports = { computeOrderTotals };
