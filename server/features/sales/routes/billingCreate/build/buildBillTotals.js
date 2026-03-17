const buildBillTotals = (deps, context, itemResult) => {
  const { generateBillNumber } = deps;
  const { requestBody, linkedOrderId, linkedOrderItems, customer, customerName, customerEmail, customerPhone, customerAddress, billType, fulfillmentMode } = context;
  const { itemFulfillmentRows, shouldApplySalesStock, salesQtyByProduct } = itemResult;

  const subtotal = itemFulfillmentRows.reduce((sum, it) => sum + Number(it.amount || 0), 0);
  const billDiscount = Math.min(subtotal, Math.max(0, Number(requestBody.discount_amount || 0)));
  const totalAmount = Math.max(0, subtotal - billDiscount);
  const paidAmount = Math.max(0, Math.min(totalAmount, Number(requestBody.paid_amount || 0)));
  const creditAmount = Math.max(0, totalAmount - paidAmount);
  const paymentStatus = creditAmount > 0 ? 'pending' : 'paid';
  const billNumber = generateBillNumber();
  const normalizedOrderId = linkedOrderId || null;

  return {
    billNumber,
    billType,
    fulfillmentMode,
    customer,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    itemFulfillmentRows,
    shouldApplySalesStock,
    salesQtyByProduct,
    subtotal,
    billDiscount,
    totalAmount,
    paidAmount,
    creditAmount,
    paymentStatus,
    normalizedOrderId,
    linkedOrderItems,
  };
};

module.exports = { buildBillTotals };
