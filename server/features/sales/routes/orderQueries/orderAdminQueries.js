const createOrderAdminQueries = (deps) => {
  const {
    dbAllAsync,
    dbGetAsync,
    normalizeOrderStatus,
    normalizeOrderPaymentStatus,
    parseOrderAddress,
    ORDER_STATUS_ORDERED,
  } = deps;

  const hydrateOrder = async (order) => {
    if (!order) return null;
    const items = await dbAllAsync(
      `SELECT oi.*,
              COALESCE(NULLIF(oi.product_name, ''), p.name, 'Item') AS product_name,
              p.stock AS stock
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?
       ORDER BY oi.id ASC`,
      [order.id]
    );
    return {
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
      items,
    };
  };

  const getOrderWithItemsById = async (orderId) => {
    const order = await dbGetAsync(
      `SELECT o.*, b.id AS bill_id, b.bill_number AS linked_bill_number
       FROM orders o
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.id = ?`,
      [orderId]
    );
    return hydrateOrder(order);
  };

  const getOrderWithItemsByNumber = async (orderNumber) => {
    const order = await dbGetAsync(
      `SELECT o.*, b.id AS bill_id, b.bill_number AS linked_bill_number
       FROM orders o
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.order_number = ?`,
      [orderNumber]
    );
    return hydrateOrder(order);
  };

  const getOrderHistory = async (orderId) => {
    const rows = await dbAllAsync(
      `SELECT h.id, h.order_id, h.status, h.description, h.created_by, h.created_at, u.name as created_by_name
       FROM order_status_history h
       LEFT JOIN users u ON u.id = h.created_by
       WHERE h.order_id = ?
       ORDER BY h.created_at DESC`,
      [orderId]
    );
    return rows.map((row) => ({
      ...row,
      status: normalizeOrderStatus(row?.status, ORDER_STATUS_ORDERED),
    }));
  };

  const getOrdersForUser = async (userId) => {
    const orders = await dbAllAsync(
      `SELECT o.*,
              b.id AS bill_id,
              b.bill_number AS linked_bill_number,
              COALESCE(agg.requested_qty, 0) AS requested_qty,
              COALESCE(agg.available_now_qty, 0) AS available_now_qty,
              COALESCE(agg.fulfilled_qty, 0) AS fulfilled_qty,
              COALESCE(agg.pending_qty, 0) AS pending_qty
       FROM orders o
       LEFT JOIN (
         SELECT order_id,
                SUM(COALESCE(requested_qty, quantity, 0)) AS requested_qty,
                SUM(COALESCE(available_now_qty, 0)) AS available_now_qty,
                SUM(COALESCE(fulfilled_qty, 0)) AS fulfilled_qty,
                SUM(COALESCE(pending_qty, 0)) AS pending_qty
         FROM order_items
         GROUP BY order_id
       ) agg ON agg.order_id = o.id
       LEFT JOIN bills b ON b.order_id = o.id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [userId]
    );
    const enriched = await Promise.all(orders.map((order) => hydrateOrder(order)));
    return enriched;
  };

  return {
    getOrderWithItemsById,
    getOrderWithItemsByNumber,
    getOrderHistory,
    getOrdersForUser,
  };
};

module.exports = { createOrderAdminQueries };
