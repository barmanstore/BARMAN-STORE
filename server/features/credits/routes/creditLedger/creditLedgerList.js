const registerCreditLedgerListRoutes = (deps) => {
  const { app, requireAuth, requireAdmin, dbGetAsync, dbAllAsync } = deps;

  const creditLedgerSelect = `
    SELECT ch.*,
           u.name AS customer_name,
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
    LEFT JOIN users u ON u.id = ch.user_id
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
         ORDER BY transaction_ts DESC, created_at DESC, id DESC
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
            `${creditLedgerSelect}
           WHERE ch.user_id = ?
           ORDER BY ch.transaction_ts ASC, ch.created_at ASC, ch.id ASC`,
            [selectedUserId]
          )
        : await dbAllAsync(
            `${creditLedgerSelect}
           ORDER BY ch.transaction_ts ASC, ch.created_at ASC, ch.id ASC`
          );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditLedgerListRoutes };
