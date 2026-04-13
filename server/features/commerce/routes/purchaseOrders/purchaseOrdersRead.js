const registerPurchaseOrdersReadRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
  } = deps;

  app.get('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
    try {
      const row = await dbGetAsync(
        `SELECT
           po.*,
           d.name as distributor_name,
           d.address as distributor_address,
           d.contacts as distributor_contacts,
           s.name as supplier_name,
           s.phone as supplier_phone,
           s.alt_phone as supplier_alt_phone
         FROM purchase_orders po
         LEFT JOIN distributors d ON d.id = po.distributor_id
         LEFT JOIN suppliers s ON s.id = po.supplier_id
         WHERE po.id = ?`,
        [req.params.id]
      );
      if (!row) return res.status(404).json({ error: 'Purchase order not found' });
      const loadMany = async (sql, fallback = []) => {
        try {
          return await dbAllAsync(sql, [row.id]);
        } catch (_) {
          return fallback;
        }
      };
      const [items, payments, history, reminders] = await Promise.all([
        loadMany(`SELECT * FROM purchase_order_items WHERE order_id = ?`),
        loadMany(
          `SELECT *
           FROM purchase_order_payments
           WHERE purchase_order_id = ?
           ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC`
        ),
        loadMany(
          `SELECT *
           FROM purchase_order_status_history
           WHERE purchase_order_id = ?
           ORDER BY created_at DESC, id DESC`
        ),
        loadMany(
          `SELECT *
           FROM distributor_purchase_reminders
           WHERE purchase_order_id = ?
           ORDER BY scheduled_for DESC, created_at DESC, id DESC`
        ),
      ]);
      return res.json({ ...row, items, payments, history, reminders });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersReadRoutes };
