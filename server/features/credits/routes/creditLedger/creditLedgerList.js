const registerCreditLedgerListRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbGetAsync,
    dbAllAsync,
  } = deps;

  app.get('/api/users/:userId/credit-balance', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const row = await dbGetAsync(
        `SELECT balance
         FROM credit_history
         WHERE user_id = ?
         ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) DESC, created_at DESC, id DESC
         LIMIT 1`,
        [req.params.userId]
      );
      return res.json({ balance: row?.balance || 0 });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/credit/ledger', requireAdmin, async (req, res) => {
    try {
      const selectedUserId = Number(req.query.user_id || 0);
      const rows = selectedUserId
        ? await dbAllAsync(
          `SELECT ch.*, u.name AS customer_name
           FROM credit_history ch
           LEFT JOIN users u ON u.id = ch.user_id
           WHERE ch.user_id = ?
           ORDER BY COALESCE(ch.transaction_ts, ch.transaction_date::timestamp, ch.created_at) ASC, ch.created_at ASC, ch.id ASC`,
          [selectedUserId]
        )
        : await dbAllAsync(
          `SELECT ch.*, u.name AS customer_name
           FROM credit_history ch
           LEFT JOIN users u ON u.id = ch.user_id
           ORDER BY COALESCE(ch.transaction_ts, ch.transaction_date::timestamp, ch.created_at) ASC, ch.created_at ASC, ch.id ASC`
        );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditLedgerListRoutes };
