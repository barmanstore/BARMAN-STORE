const createInputError = (status, message) => Object.assign(new Error(message), { status });

const prepareOrderStatusUpdate = async ({
  orderId,
  dbGetAsync,
  dbAllAsync,
  normalizeOrderStatus,
  ORDER_STATUS_ORDERED,
  ORDER_STATUS_RECEIVED,
  reapplyPending,
}) => {
  const order = await dbGetAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) throw createInputError(404, 'Order not found');

  const currentStatus = normalizeOrderStatus(order.status, ORDER_STATUS_ORDERED);
  if (currentStatus === ORDER_STATUS_RECEIVED && !reapplyPending) {
    return {
      order,
      items: [],
      currentStatus,
      isInitialReceive: false,
      alreadyReceived: true,
    };
  }
  if (currentStatus !== ORDER_STATUS_ORDERED && currentStatus !== ORDER_STATUS_RECEIVED) {
    throw createInputError(400, 'Order is not in ordered state');
  }

  const items = await dbAllAsync('SELECT * FROM order_items WHERE order_id = ?', [orderId]);
  return {
    order,
    items,
    currentStatus,
    isInitialReceive: currentStatus !== ORDER_STATUS_RECEIVED,
    alreadyReceived: false,
  };
};

module.exports = { prepareOrderStatusUpdate };
