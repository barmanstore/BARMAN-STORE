const registerOrderStatsRoutes = (deps) => {
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

app.get('/api/stats/orders', requireAdmin, async (_, res) => {
  try {
    const totalOrders = (await dbGetAsync(`SELECT COUNT(*) AS count FROM orders`))?.count || 0;
    const totalRevenue = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) AS total FROM orders`))?.total || 0;
    const pendingOrders = (await dbGetAsync(`SELECT COUNT(*) AS count FROM orders WHERE status = ?`, [ORDER_STATUS_ORDERED]))?.count || 0;
    return res.json({
      totalOrders,
      totalRevenue,
      pendingOrders,
      byStatus: { ordered: pendingOrders },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
};

module.exports = { registerOrderStatsRoutes };
