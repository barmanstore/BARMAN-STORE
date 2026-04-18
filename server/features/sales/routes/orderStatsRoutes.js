const registerOrderStatsRoutes = (deps) => {
  const { app, requireCapability, dbGetAsync, ORDER_STATUS_ORDERED } = deps;

  app.get(
    '/api/stats/orders',
    requireCapability('view_backoffice', 'Backoffice access required'),
    async (_, res) => {
      try {
        const totalOrders = (await dbGetAsync(`SELECT COUNT(*) AS count FROM orders`))?.count || 0;
        const totalRevenue =
          (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) AS total FROM orders`))?.total ||
          0;
        const pendingOrders =
          (
            await dbGetAsync(`SELECT COUNT(*) AS count FROM orders WHERE status = ?`, [
              ORDER_STATUS_ORDERED,
            ])
          )?.count || 0;
        return res.json({
          totalOrders,
          totalRevenue,
          pendingOrders,
          byStatus: { ordered: pendingOrders },
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );
};

module.exports = { registerOrderStatsRoutes };
