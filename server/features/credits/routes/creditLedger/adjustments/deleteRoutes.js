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

      const result = await dbTxAsync(async () => {
        await dbRunAsync('DELETE FROM credit_history WHERE id = ? AND user_id = ?', [entryId, userId]);
        const nextBalance = await recalculateCreditBalancesForUser(userId);
        return Number(nextBalance || 0);
      });

      await logAdminAuditAsync(req, {
        action: 'credit.delete',
        entityType: 'credit_history',
        entityId: entryId,
        details: {
          user_id: userId,
          type: existing.type,
          amount: Number(existing.amount || 0),
          transaction_date: existing.transaction_date,
        },
      });

      return res.json({ success: true, balance: result });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerCreditLedgerDeleteRoutes };
