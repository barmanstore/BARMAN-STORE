const registerCreditIssuesListRoutes = (deps) => {
  const {
    app,
    requireAuth,
    dbAllAsync,
    dbGetAsync,
    runCustomerRequestPurge,
    normalizeCreditIssueStatus,
    getLatestCreditEntryAsync,
    getCustomerCreditProfileAsync,
    buildPaymentActivityBadges,
  } = deps;

  const creditHistorySelect = `
    SELECT ch.*,
           COALESCE(primary_bill.id, legacy_bill.id) AS linked_bill_id,
           COALESCE(primary_bill.bill_number, legacy_bill.bill_number, NULL) AS linked_bill_number,
           CASE
             WHEN COALESCE(ch.source_type, '') = 'bill'
               THEN COALESCE(primary_bill.bill_number, legacy_bill.bill_number, ch.source_label, ch.reference, '')
             ELSE COALESCE(ch.source_label, ch.reference, '')
           END AS resolved_source_label,
           EXISTS(
             SELECT 1
             FROM credit_history rev
             WHERE rev.user_id = ch.user_id
               AND rev.reversed_entry_id = ch.id
               AND COALESCE(rev.source_type, '') = 'reversal'
           ) AS has_reversal
    FROM credit_history ch
    LEFT JOIN bills primary_bill
      ON COALESCE(ch.source_type, '') = 'bill'
     AND COALESCE(ch.source_id, '') <> ''
     AND (
       CAST(primary_bill.id AS TEXT) = CAST(ch.source_id AS TEXT)
       OR primary_bill.bill_number = ch.source_id
     )
    LEFT JOIN bills legacy_bill
      ON COALESCE(ch.source_type, '') IN ('', 'adjustment')
     AND LOWER(COALESCE(ch.type, '')) = 'given'
     AND COALESCE(ch.reference, '') <> ''
     AND COALESCE(ch.description, '') LIKE 'Bill credit |%'
     AND legacy_bill.bill_number = ch.reference
  `;

  app.get('/api/users/:userId/credit-history', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await dbAllAsync(
        `${creditHistorySelect}
         WHERE ch.user_id = ?
         ORDER BY ch.transaction_ts DESC, ch.created_at DESC, ch.id DESC`,
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

      const [historyRows, latest, userRow, creditProfile] = await Promise.all([
        dbAllAsync(
          `SELECT id, type, amount, transaction_ts, transaction_date, due_date, created_at, source_type, source_label, reference
           FROM credit_history
           WHERE user_id = ?
           ORDER BY transaction_ts ASC, created_at ASC, id ASC`,
          [req.params.userId]
        ),
        getLatestCreditEntryAsync(requestUserId),
        dbGetAsync(`SELECT credit_limit FROM users WHERE id = ?`, [requestUserId]),
        getCustomerCreditProfileAsync(requestUserId),
      ]);

      const badgePayload = buildPaymentActivityBadges(historyRows, {
        balance: Number(latest?.balance || 0),
        creditLimit: Number(userRow?.credit_limit || 0),
        nowMs: Date.now(),
        isActive: creditProfile?.is_active,
        graceDays: creditProfile?.grace_days,
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
