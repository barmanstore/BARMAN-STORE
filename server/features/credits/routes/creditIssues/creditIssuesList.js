const registerCreditIssuesListRoutes = (deps) => {
  const {
    app,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    runCustomerRequestPurge,
    normalizeCreditIssueStatus,
    getLatestCreditEntryAsync,
    buildPaymentActivityBadges,
  } = deps;

  app.get('/api/users/:userId/credit-history', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await dbAllAsync(
        `SELECT *
         FROM credit_history
         WHERE user_id = ?
         ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) DESC, created_at DESC, id DESC`,
        [req.params.userId]
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/users/:userId/payment-badges', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const [paymentRows, latest] = await Promise.all([
        dbAllAsync(
          `SELECT amount, transaction_ts, transaction_date, created_at
           FROM credit_history
           WHERE user_id = ?
             AND LOWER(type) = 'payment'
           ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) DESC, created_at DESC, id DESC`,
          [req.params.userId]
        ),
        getLatestCreditEntryAsync(requestUserId),
      ]);

      const badgePayload = buildPaymentActivityBadges(paymentRows, {
        balance: Number(latest?.balance || 0),
        nowMs: Date.now(),
      });
      return res.json(badgePayload);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/users/:userId/credit-issues', requireAuth, async (req, res) => {
    try {
      await runCustomerRequestPurge();
      const requestUserId = Number(req.params.userId);
      if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const requestedStatus = String(req.query?.status || '').trim().toLowerCase();
      const normalizedStatus = requestedStatus
        ? normalizeCreditIssueStatus(requestedStatus, { fallback: '' })
        : '';
      if (requestedStatus && !normalizedStatus) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      const rows = await dbAllAsync(
        `SELECT cei.*,
                corr.amount as correction_amount,
                corr.type as correction_type,
                corr.reference as correction_reference
         FROM credit_entry_issues cei
         LEFT JOIN credit_history corr ON corr.id = cei.correction_entry_id
         WHERE cei.user_id = ?
           ${normalizedStatus ? 'AND cei.status = ?' : ''}
         ORDER BY cei.created_at DESC`,
        normalizedStatus ? [requestUserId, normalizedStatus] : [requestUserId]
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditIssuesListRoutes };
