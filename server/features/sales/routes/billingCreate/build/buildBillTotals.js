const buildBillTotals = (deps, context, itemResult, createHttpError) => {
  const { generateBillNumber } = deps;
  const {
    requestBody,
    linkedOrderId,
    linkedOrderItems,
    customer,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    billType,
    fulfillmentMode,
  } = context;
  const { itemFulfillmentRows, shouldApplySalesStock, salesQtyByProduct } = itemResult;

  if (linkedOrderId && fulfillmentMode === 'available_now') {
    const fulfilledQtyTotal = itemFulfillmentRows.reduce(
      (sum, it) => sum + Math.max(0, Number(it.fulfilled_qty || 0)),
      0
    );
    if (fulfilledQtyTotal <= 0) {
      throw createHttpError(400, 'No fulfilled quantity is currently available to bill');
    }
  }

  const subtotal = itemFulfillmentRows.reduce(
    (sum, it) => sum + Number(it.line_subtotal || it.amount || 0),
    0
  );
  const billDiscount = itemFulfillmentRows.reduce(
    (sum, it) => sum + Math.max(0, Number(it.discount || 0)),
    0
  );
  const totalAmount = Math.max(0, subtotal - billDiscount);
  const paidAmount = Math.max(0, Math.min(totalAmount, Number(requestBody.paid_amount || 0)));
  const creditAmount = Math.max(0, totalAmount - paidAmount);
  if (!linkedOrderId && creditAmount > 0 && !(Number(customer?.id || 0) > 0)) {
    throw createHttpError(400, 'Select a saved customer before creating a credit bill');
  }
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
