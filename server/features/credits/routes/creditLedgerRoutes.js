const registerCreditLedgerRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    dbAllAsync,
    dbTxAsync,
    parsePhoneInput,
    createAppNotification,
    notifyAdmins,
    runCustomerRequestPurge,
    logAdminAuditAsync,
    normalizeCreditIssueStatus,
    getLatestCreditEntryAsync,
    buildPaymentActivityBadges,
    recalculateCreditBalancesForUser,
    normalizeTransactionDate,
    buildCreditTransactionTimestamp,
    CREDIT_ENTRY_DEDUP_WINDOW_MS,
    toTimestampMs,
    resolveClientRequestId,
    isUniqueViolationError,
  } = deps;

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
         ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) DESC, created_at DESC, id DESC
         LIMIT 1`,
        [req.params.userId]
      );
      return res.json({ balance: row?.balance || 0 });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
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
  
  app.get('/api/credit/ledger', requireAdmin, async (req, res) => {
    try {
      const selectedUserId = Number(req.query.user_id || 0);
      const rows = selectedUserId
        ? await dbAllAsync(
          `SELECT ch.*, u.name AS customer_name
           FROM credit_history ch
           LEFT JOIN users u ON u.id = ch.user_id
           WHERE ch.user_id = ?
           ORDER BY COALESCE(ch.transaction_ts, ch.transaction_date::timestamp, ch.created_at) ASC, ch.created_at ASC, ch.id ASC`,
          [selectedUserId]
        )
        : await dbAllAsync(
          `SELECT ch.*, u.name AS customer_name
           FROM credit_history ch
           LEFT JOIN users u ON u.id = ch.user_id
           ORDER BY COALESCE(ch.transaction_ts, ch.transaction_date::timestamp, ch.created_at) ASC, ch.created_at ASC, ch.id ASC`
        );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
  
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

module.exports = { registerCreditLedgerRoutes };
