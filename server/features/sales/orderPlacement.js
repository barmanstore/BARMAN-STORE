const createOrderPlacement = (deps) => {
  const {
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeEmail,
    parsePhoneInput,
    parseBooleanEnv,
    normalizePaymentMethod,
    generateOrderNumber,
    normalizeOrderPaymentStatus,
    ORDER_STATUS_ORDERED,
  } = deps;
  const { validateOrderPayload } = require('./orderPlacement/validatePayload');
  const { parseOrderItems } = require('./orderPlacement/parseItems');
  const { loadOrderStockSnapshots } = require('./orderPlacement/loadStockSnapshots');
  const { computeOrderTotals } = require('./orderPlacement/computeTotals');
  const { persistOrderPlacement } = require('./orderPlacement/persistOrder');

  const placeOrder = async (payload) => {
    const {
      user_id = null,
      customer_name,
      customer_email = '',
      customer_phone = null,
      shipping_address = {},
      items = [],
      payment_method = 'cash',
    } = payload;

    const { normalizedCustomerEmail, normalizedCustomerPhone } = await validateOrderPayload({
      payload,
      dbGetAsync,
      normalizeEmail,
      parsePhoneInput,
    });

    const parsedItems = parseOrderItems({ items, parseBooleanEnv });
    const { stockSnapshotByProductId } = await loadOrderStockSnapshots({
      parsedItems,
      dbGetAsync,
    });

    const totals = computeOrderTotals({
      parsedItems,
      paymentMethod: payment_method,
      normalizePaymentMethod,
      generateOrderNumber,
      ORDER_STATUS_ORDERED,
    });

    return persistOrderPlacement({
      dbRunAsync,
      dbTxAsync,
      normalizeOrderPaymentStatus,
      parsedItems,
      stockSnapshotByProductId,
      orderNumber: totals.orderNumber,
      userId: user_id,
      customerName: customer_name,
      customerEmail: normalizedCustomerEmail,
      customerPhone: normalizedCustomerPhone,
      shippingAddress: shipping_address,
      total: totals.total,
      createdStatus: totals.createdStatus,
      normalizedPaymentMethod: totals.normalizedPaymentMethod,
    });
  };

  return { placeOrder };
};

module.exports = { createOrderPlacement };
