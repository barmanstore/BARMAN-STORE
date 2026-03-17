const registerCreditLedgerCreateRoutes = (deps) => {
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
          const existingByRequest = await dbGetAsync('SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1', [clientRequestId]);
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
          const transactionDateCompareSql = 'COALESCE(transaction_date::text, \'\')';
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
              const existing = await dbGetAsync('SELECT * FROM credit_history WHERE id = ?', [maybeDuplicate.id]);
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

        await recalculateCreditBalancesForUser(req.params.userId);

        const transaction = await dbGetAsync('SELECT * FROM credit_history WHERE id = ?', [insertResult.lastInsertRowid]);
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
        const existingByRequest = await dbGetAsync('SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1', [clientRequestId]);
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
};

module.exports = { registerCreditLedgerCreateRoutes };
