const registerOrderListRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeOrderStatus,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
    normalizeOrderPaymentStatus,
    parseOrderAddress,
    normalizeEmail,
    parsePhoneInput,
    parseBooleanEnv,
    normalizePaymentMethod,
    generateOrderNumber,
    validateCustomerProfile,
    createAppNotification,
    notifyAdmins,
    logAdminAuditAsync,
    logStockLedgerAsync
  } = deps;

app.get('/api/orders', requireAdmin, async (_, res) => {
  try {
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
       ORDER BY o.created_at DESC`
    );
    return res.json(orders.map((order) => ({
      ...order,
      status: normalizeOrderStatus(order?.status, ORDER_STATUS_ORDERED),
      payment_method: 'cash',
      payment_status: normalizeOrderPaymentStatus(order?.payment_status, order?.status),
      shipping_address: parseOrderAddress(order?.shipping_address),
    })));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

};

module.exports = { registerOrderListRoutes };
