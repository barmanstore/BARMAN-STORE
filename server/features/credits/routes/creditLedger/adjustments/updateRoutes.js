const { createCreditEntryImageStorage } = require('./creditEntryImageStorage');

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
    parseDataUrlImage,
    PROFILE_IMAGE_ALLOWED_MIME,
    PROFILE_IMAGE_MAX_BYTES,
    mimeToExt,
    deleteManagedProfileImage,
    profileImageStorage,
    crypto,
  } = deps;

  const { storeCreditEntryImage } = createCreditEntryImageStorage({
    parseDataUrlImage,
    PROFILE_IMAGE_ALLOWED_MIME,
    PROFILE_IMAGE_MAX_BYTES,
    mimeToExt,
    profileImageStorage,
    deleteManagedProfileImage,
    crypto,
  });

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

      const existingSourceType = String(existing?.source_type || '').trim().toLowerCase();
      const isLegacyBillEntry = !existingSourceType
        && /^Bill credit \|/i.test(String(existing?.description || '').trim())
        && String(existing?.reference || '').trim();
      if (['bill', 'reversal', 'issue_correction'].includes(existingSourceType) || isLegacyBillEntry) {
        return res.status(400).json({ error: 'This entry is linked to system history and cannot be edited directly. Add a new manual entry instead.' });
      }

      const { type, amount, description, reference, transactionDate, image_base64: imageBase64 } = req.body || {};
      if (!type || !['given', 'payment'].includes(type)) {
        return res.status(400).json({ error: 'Invalid transaction type' });
      }

      const normalizedDescription = String(description || '').trim();
      const normalizedReference = String(reference || '').trim();
      const parsedAmount = Number(amount);
      if (!parsedAmount || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be positive' });
      }

      const existingAmount = Math.abs(Number(existing.amount || 0));
      const existingDelta = String(existing.type || '').trim().toLowerCase() === 'payment'
        ? -existingAmount
        : existingAmount;
      const balanceBeforeEntry = Number(existing.balance || 0) - existingDelta;
      if (type === 'payment') {
        if (balanceBeforeEntry <= 0) {
          return res.status(400).json({ error: 'Customer has no due balance for a payment entry' });
        }
        if (parsedAmount > balanceBeforeEntry) {
          return res.status(400).json({ error: `Payment exceeds current due of Rs ${balanceBeforeEntry.toFixed(2)}` });
        }
      }

      const normalizedDate = normalizeTransactionDate(transactionDate);
      const referenceTs = existing?.transaction_ts || existing?.created_at || null;
      const referenceDate = referenceTs ? new Date(referenceTs) : new Date();
      const transactionTs = buildCreditTransactionTimestamp(transactionDate, referenceDate);

      await dbRunAsync(
        `UPDATE credit_history
         SET type = ?,
             amount = ?,
             description = ?,
             reference = ?,
             transaction_date = ?,
             transaction_ts = ?,
             source_type = COALESCE(NULLIF(source_type, ''), 'adjustment'),
             source_label = ?,
             edited = 1,
             edited_at = CURRENT_TIMESTAMP,
             edited_by = ?
         WHERE id = ? AND user_id = ?`,
        [
          type,
          parsedAmount,
          normalizedDescription || null,
          normalizedReference || null,
          normalizedDate,
          transactionTs,
          normalizedReference || null,
          req.authUser?.id || null,
          entryId,
          userId
         ]
      );

      if (String(imageBase64 || '').trim()) {
        const nextImagePath = await storeCreditEntryImage({
          imageBase64,
          existingImagePath: existing.image_path,
          userId,
          entryId,
        });
        await dbRunAsync('UPDATE credit_history SET image_path = ? WHERE id = ? AND user_id = ?', [nextImagePath, entryId, userId]);
      }

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
      const message = error.message || 'Failed to update credit entry';
      return res.status(Number(error?.status || 0) || 500).json({ error: message });
    }
  });
};

module.exports = { registerCreditLedgerUpdateRoutes };
