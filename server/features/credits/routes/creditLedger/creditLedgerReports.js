const registerCreditLedgerReportsRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbGetAsync,
    dbAllAsync,
    getLatestCreditEntryAsync,
  } = deps;

  app.post('/api/credit/check-limit', requireAuth, async (req, res) => {
    try {
      const customerId = req.body?.customer_id;
      const additionalAmount = Number(req.body?.additional_amount || 0);
      if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
      const user = await dbGetAsync(`SELECT id, name, credit_limit FROM users WHERE id = ?`, [customerId]);
      if (!user) return res.status(404).json({ error: 'Customer not found' });
      const last = await getLatestCreditEntryAsync(customerId);
      const currentBalance = Number(last?.balance || 0);
      const creditLimit = Number(user.credit_limit || 0);
      const projected = currentBalance + additionalAmount;
      const allowed = creditLimit <= 0 ? true : projected <= creditLimit;
      return res.json({
        allowed,
        customer_id: user.id,
        customer_name: user.name,
        current_balance: currentBalance,
        additional_amount: additionalAmount,
        projected_balance: projected,
        credit_limit: creditLimit,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/credit/aging', requireAdmin, async (_, res) => {
    try {
      const reportSql = `
        SELECT
          u.id as customer_id,
          u.name as customer_name,
          u.email,
          u.phone,
          COALESCE(u.credit_limit, 0) as credit_limit,
          COALESCE((SELECT balance FROM credit_history ch WHERE ch.user_id = u.id ORDER BY COALESCE(ch.transaction_ts, ch.transaction_date::timestamp, ch.created_at) DESC, ch.created_at DESC, ch.id DESC LIMIT 1), 0) as current_balance,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) <= 30), 0) as days_0_30,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) > 30 AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) <= 60), 0) as days_31_60,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) > 60 AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) <= 90), 0) as days_61_90,
          COALESCE((SELECT SUM(amount) FROM credit_history ch WHERE ch.user_id = u.id AND ch.type='given' AND EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ch.created_at)) > 90), 0) as days_over_90
        FROM users u
        WHERE u.role = 'customer'
        ORDER BY current_balance DESC, u.name ASC
      `;
      const report = await dbAllAsync(reportSql);
      const summary = report.reduce(
        (acc, r) => {
          acc.total_outstanding += Number(r.current_balance || 0);
          acc.aging_0_30 += Number(r.days_0_30 || 0);
          acc.aging_31_60 += Number(r.days_31_60 || 0);
          acc.aging_61_90 += Number(r.days_61_90 || 0);
          acc.aging_over_90 += Number(r.days_over_90 || 0);
          if (Number(r.days_31_60 || 0) > 0 || Number(r.days_61_90 || 0) > 0 || Number(r.days_over_90 || 0) > 0) {
            acc.customers_overdue += 1;
          }
          return acc;
        },
        { total_outstanding: 0, customers_overdue: 0, aging_0_30: 0, aging_31_60: 0, aging_61_90: 0, aging_over_90: 0 }
      );
      return res.json({ report, summary });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditLedgerReportsRoutes };
