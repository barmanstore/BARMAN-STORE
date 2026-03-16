const registerCreditLedgerAdjustmentsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    logAdminAuditAsync,
    normalizeTransactionDate,
    buildCreditTransactionTimestamp,
    recalculateCreditBalancesForUser,
    getLatestCreditEntryAsync,
    CREDIT_ENTRY_DEDUP_WINDOW_MS,
    toTimestampMs,
    resolveClientRequestId,
    isUniqueViolationError,
  } = deps;

  app.post('/api/users/:userId/credit', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    try {
      const idempotency = resolveClientRequestId(req);
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.value;

      const result = await dbTxAsync(async () => {
        if (clientRequestId) {
          const existingByRequest = await dbGetAsync(`SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
          if (existingByRequest) {
            return {
              status: 200,
              payload: {
                success: true,
                deduplicated: true,
                balance: Number(existingByRequest.balance || 0),
                transaction: existingByRequest,
              }
            };
          }
        }

        const { type, amount, description, reference, transactionDate } = req.body || {};
        if (!type || !['given', 'payment'].includes(type)) {
          throw new Error('Invalid transaction type');
        }
        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount <= 0) {
          throw new Error('Amount must be positive');
        }
        const normalizedDescription = String(description || '').trim();
        const normalizedReference = String(reference || '').trim();
        const createdById = Number(req.authUser?.id || 0);
        const last = await getLatestCreditEntryAsync(req.params.userId);
        const current = Number(last?.balance || 0);
        const next = type === 'given' ? current + parsedAmount : current - parsedAmount;
        const normalizedDate = normalizeTransactionDate(transactionDate);
        const transactionTs = buildCreditTransactionTimestamp(transactionDate, new Date());

        if (CREDIT_ENTRY_DEDUP_WINDOW_MS > 0) {
          const transactionDateCompareSql = `COALESCE(transaction_date::text, '')`;
          const maybeDuplicate = await dbGetAsync(
            `SELECT id, created_at, balance
             FROM credit_history
             WHERE user_id = ?
               AND type = ?
               AND amount = ?
               AND COALESCE(description, '') = ?
               AND COALESCE(reference, '') = ?
               AND ${transactionDateCompareSql} = ?
               AND COALESCE(created_by, 0) = ?
             ORDER BY id DESC
             LIMIT 1`,
            [
              req.params.userId,
              type,
              parsedAmount,
              normalizedDescription,
              normalizedReference,
              normalizedDate || '',
              createdById,
            ]
          );
          if (maybeDuplicate) {
            const createdAtMs = toTimestampMs(maybeDuplicate.created_at);
            const ageMs = createdAtMs > 0 ? Date.now() - createdAtMs : Number.POSITIVE_INFINITY;
            if (ageMs >= 0 && ageMs <= CREDIT_ENTRY_DEDUP_WINDOW_MS) {
              const existing = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ?`, [maybeDuplicate.id]);
              return {
                status: 200,
                payload: {
                  success: true,
                  deduplicated: true,
                  message: 'Duplicate submit prevented',
                  balance: Number(maybeDuplicate.balance || current),
                  transaction: existing,
                }
              };
            }
          }
        }

        const insertResult = await dbRunAsync(
          `INSERT INTO credit_history (user_id, type, amount, balance, description, reference, transaction_date, transaction_ts, created_by, client_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.userId,
            type,
            parsedAmount,
            next,
            normalizedDescription || null,
            normalizedReference || null,
            normalizedDate,
            transactionTs,
            createdById || null,
            clientRequestId,
          ]
        );

        // Recalculate balances for the user to ensure chronological consistency, especially for backdated entries.
        await recalculateCreditBalancesForUser(req.params.userId);

        const transaction = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ?`, [insertResult.lastInsertRowid]);
        return {
          status: 201,
          payload: {
            success: true,
            balance: Number(transaction?.balance || next),
            transaction,
          }
        };
      });

      if (result.status === 201) {
        await logAdminAuditAsync(req, {
          action: 'credit.create',
          entityType: 'credit_history',
          entityId: result.payload.transaction.id,
          requestId: clientRequestId,
          details: {
            user_id: Number(req.params.userId || 0),
            type: req.body.type,
            amount: Number(req.body.amount),
            transaction_date: result.payload.transaction.transaction_date,
          },
        });
      }

      return res.status(result.status).json(result.payload);
    } catch (error) {
      if (clientRequestId && isUniqueViolationError(error)) {
        const existingByRequest = await dbGetAsync(`SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
        if (existingByRequest) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            balance: Number(existingByRequest.balance || 0),
            transaction: existingByRequest,
          });
        }
      }
      const message = error.message || 'Failed to create credit entry';
      const status = message.includes('Invalid') || message.includes('positive') ? 400 : 500;
      return res.status(status).json({ error: message });
    }
  });

  app.put('/api/users/:userId/credit/:entryId', requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const entryId = Number(req.params.entryId);
      if (!userId || !entryId) {
        return res.status(400).json({ error: 'Invalid user or transaction id' });
      }

      const existing = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ? AND user_id = ?`, [entryId, userId]);
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
      const updated = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ?`, [entryId]);
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

  app.delete('/api/users/:userId/credit/:entryId', requireAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const entryId = Number(req.params.entryId);
      if (!userId || !entryId) {
        return res.status(400).json({ error: 'Invalid user or transaction id' });
      }

      const existing = await dbGetAsync(`SELECT * FROM credit_history WHERE id = ? AND user_id = ?`, [entryId, userId]);
      if (!existing) {
        return res.status(404).json({ error: 'Credit transaction not found' });
      }

      const result = await dbTxAsync(async () => {
        await dbRunAsync(`DELETE FROM credit_history WHERE id = ? AND user_id = ?`, [entryId, userId]);
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

module.exports = { registerCreditLedgerAdjustmentsRoutes };
