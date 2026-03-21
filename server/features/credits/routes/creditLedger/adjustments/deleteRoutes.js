const registerCreditLedgerDeleteRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    logAdminAuditAsync,
    recalculateCreditBalancesForUser,
  } = deps;

  app.delete('/api/users/:userId/credit/:entryId', requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const entryId = Number(req.params.entryId);
      if (!userId || !entryId) {
        return res.status(400).json({ error: 'Invalid user or transaction id' });
      }

      const existing = await dbGetAsync('SELECT * FROM credit_history WHERE id = ? AND user_id = ?', [entryId, userId]);
      if (!existing) {
        return res.status(404).json({ error: 'Credit transaction not found' });
      }

      const existingSourceType = String(existing?.source_type || '').trim().toLowerCase();
      if (existingSourceType === 'reversal') {
        return res.status(400).json({ error: 'Reversal entries cannot be reversed again' });
      }

      const priorReversal = await dbGetAsync(
        `SELECT id
         FROM credit_history
         WHERE user_id = ?
           AND reversed_entry_id = ?
           AND COALESCE(source_type, '') = 'reversal'
         LIMIT 1`,
        [userId, entryId]
      );
      if (priorReversal) {
        return res.status(400).json({ error: 'This entry has already been reversed' });
      }

      const result = await dbTxAsync(async () => {
        const reversalAmount = Math.abs(Number(existing.amount || 0));
        const reversalType = String(existing.type || '').trim().toLowerCase() === 'payment'
          ? 'given'
          : 'payment';
        const transactionTs = new Date().toISOString();
        const transactionDate = transactionTs.slice(0, 10);
        const sourceLabel = String(existing.reference || '').trim()
          ? `Reversal for ${String(existing.reference || '').trim()}`
          : `Reversal for entry #${entryId}`;
        await dbRunAsync(
          `INSERT INTO credit_history (
             user_id,
             type,
             amount,
             balance,
             description,
             reference,
             transaction_date,
             transaction_ts,
             created_by,
             client_request_id,
             source_type,
             source_id,
             source_label,
             reversed_entry_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
          [
            userId,
            reversalType,
            reversalAmount,
            Number(existing.balance || 0),
            `Reversal of entry #${entryId}`,
            `REV-${entryId}`,
            transactionDate,
            transactionTs,
            Number(req.authUser?.id || 0) || null,
            'reversal',
            String(entryId),
            sourceLabel,
            entryId,
          ]
        );
        const nextBalance = await recalculateCreditBalancesForUser(userId);
        return Number(nextBalance || 0);
      });

      await logAdminAuditAsync(req, {
        action: 'credit.reverse',
        entityType: 'credit_history',
        entityId: entryId,
        details: {
          user_id: userId,
          type: existing.type,
          amount: Number(existing.amount || 0),
          transaction_date: existing.transaction_date,
        },
      });

      return res.json({ success: true, reversed: true, balance: result });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditLedgerDeleteRoutes };
