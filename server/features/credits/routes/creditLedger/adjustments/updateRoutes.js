const registerCreditLedgerUpdateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    logAdminAuditAsync,
    normalizeTransactionDate,
    buildCreditTransactionTimestamp,
    recalculateCreditBalancesForUser,
    getLatestCreditEntryAsync,
  } = deps;

  app.put('/api/users/:userId/credit/:entryId', requireAdmin, async (req, res) => {
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

      const latest = await getLatestCreditEntryAsync(userId);
      if (!latest || Number(latest.id) !== entryId) {
        return res.status(400).json({ error: 'Only the latest transaction for this customer can be edited' });
      }

      const { type, amount, description, reference, transactionDate } = req.body || {};
      if (!type || !['given', 'payment'].includes(type)) {
        return res.status(400).json({ error: 'Invalid transaction type' });
      }

      const parsedAmount = Number(amount);
      if (!parsedAmount || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
      }

      const normalizedDate = normalizeTransactionDate(transactionDate);
      const referenceTs = existing?.transaction_ts || existing?.created_at || null;
      const referenceDate = referenceTs ? new Date(referenceTs) : new Date();
      const transactionTs = buildCreditTransactionTimestamp(transactionDate, referenceDate);

      await dbRunAsync(
        `UPDATE credit_history
         SET type = ?, amount = ?, description = ?, reference = ?, transaction_date = ?, transaction_ts = ?, edited = 1, edited_at = CURRENT_TIMESTAMP, edited_by = ?
         WHERE id = ? AND user_id = ?`,
        [
          type,
          parsedAmount,
          description || null,
          reference || null,
          normalizedDate,
          transactionTs,
          req.authUser?.id || null,
          entryId,
          userId
        ]
      );

      const nextBalance = await recalculateCreditBalancesForUser(userId);
      const updated = await dbGetAsync('SELECT * FROM credit_history WHERE id = ?', [entryId]);
      await logAdminAuditAsync(req, {
        action: 'credit.update',
        entityType: 'credit_history',
        entityId: entryId,
        details: {
          user_id: userId,
          type,
          amount: parsedAmount,
          transaction_date: normalizedDate,
        },
      });

      return res.json({
        success: true,
        balance: Number(nextBalance || 0),
        transaction: updated
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditLedgerUpdateRoutes };
