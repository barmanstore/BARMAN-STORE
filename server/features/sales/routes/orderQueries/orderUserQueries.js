const registerOrderUserQueries = (deps) => {
  const {
    app,
    requireAuth,
    dbGetAsync,
    canAccessOrder,
    getOrderWithItemsById,
    getOrderWithItemsByNumber,
    getOrderHistory,
    getOrdersForUser,
  } = deps;

  app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
      const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!canAccessOrder(req.authUser, order)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const payload = await getOrderWithItemsById(req.params.id);
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/orders/:id/history', requireAuth, async (req, res) => {
    try {
      const order = await dbGetAsync(`SELECT * FROM orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!canAccessOrder(req.authUser, order)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await getOrderHistory(req.params.id);
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/orders/number/:orderNumber', requireAuth, async (req, res) => {
    try {
      const order = await dbGetAsync(
        `SELECT o.*
         FROM orders o
         WHERE o.order_number = ?`,
        [req.params.orderNumber]
      );
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (!canAccessOrder(req.authUser, order)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const payload = await getOrderWithItemsByNumber(req.params.orderNumber);
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/users/:userId/orders', requireAuth, async (req, res) => {
    try {
      const targetUserId = Number(req.params.userId);
      if (!targetUserId) return res.status(400).json({ error: 'Invalid user id' });
      if (req.authUser.role !== 'admin' && Number(req.authUser.id) !== targetUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const orders = await getOrdersForUser(req.params.userId);
      return res.json(orders);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerOrderUserQueries };
