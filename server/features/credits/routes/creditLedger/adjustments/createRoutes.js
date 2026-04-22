const { createCreditEntryImageStorage } = require('./creditEntryImageStorage');
const { resolveCreditTermsDays } = require('../../../utils/creditStatusPolicy');

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const addDaysToDateKey = (dateKey, days) => {
  if (!DATE_KEY_PATTERN.test(String(dateKey || '').trim())) return '';
  const [year, month, day] = dateKey.split('-').map((v) => Number(v));
  const baseMs = Date.UTC(year, month - 1, day);
  const safeDays = Math.max(0, Math.floor(Number(days || 0)));
  const next = new Date(baseMs + safeDays * DAY_MS);
  return next.toISOString().slice(0, 10);
};

const resolveDueDateKey = ({
  dueDate,
  transactionDate,
  transactionDateKey,
  entryType,
  creditTermsDays,
  normalizeTransactionDate,
}) => {
  const explicitDue = normalizeTransactionDate(dueDate);
  if (explicitDue) return explicitDue;
  if (entryType === 'payment') {
    const normalizedTx = normalizeTransactionDate(transactionDate);
    return normalizedTx || transactionDateKey || '';
  }
  const normalizedTx = normalizeTransactionDate(transactionDate);
  if (normalizedTx) return addDaysToDateKey(normalizedTx, creditTermsDays);
  return transactionDateKey || '';
};

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
    rebuildCustomerPaymentIntelligence,
    getLatestCreditEntryAsync,
    getCustomerCreditProfileAsync,
    getCustomerPaymentSummaryAsync,
    CREDIT_ENTRY_DEDUP_WINDOW_MS,
    toTimestampMs,
    resolveClientRequestId,
    isUniqueViolationError,
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

  app.post('/api/users/:userId/credit', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    try {
      const idempotency = resolveClientRequestId(req);
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.value;

      const result = await dbTxAsync(async () => {
        if (clientRequestId) {
          const existingByRequest = await dbGetAsync(
            'SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1',
            [clientRequestId]
          );
          if (existingByRequest) {
            return {
              status: 200,
              payload: {
                success: true,
                deduplicated: true,
                balance: Number(existingByRequest.balance || 0),
                transaction: existingByRequest,
              },
            };
          }
        }

        const {
          type,
          amount,
          description,
          reference,
          transactionDate,
          dueDate,
          due_date: dueDateAlt,
          image_base64: imageBase64,
        } = req.body || {};
        if (!type || !['given', 'payment'].includes(type)) {
          const error = new Error('Invalid transaction type');
          error.status = 400;
          throw error;
        }
        const parsedAmount = Number(amount);
        if (!parsedAmount || parsedAmount <= 0) {
          const error = new Error('Amount must be positive');
          error.status = 400;
          throw error;
        }
        const normalizedDescription = String(description || '').trim();
        const normalizedReference = String(reference || '').trim();
        const createdById = Number(req.authUser?.id || 0);
        const last = await getLatestCreditEntryAsync(req.params.userId);
        const current = Number(last?.balance || 0);
        const next = type === 'given' ? current + parsedAmount : current - parsedAmount;
        const normalizedDate = normalizeTransactionDate(transactionDate);
        const transactionTs = buildCreditTransactionTimestamp(transactionDate, new Date());
        const transactionDateKey = String(transactionTs || '').slice(0, 10);
        const creditProfile = await getCustomerCreditProfileAsync(req.params.userId);
        const paymentSummary = await getCustomerPaymentSummaryAsync(req.params.userId);
        const creditTermsDays = resolveCreditTermsDays({
          creditTermsDays: creditProfile?.credit_terms_days,
          paymentSummary,
        });
        const normalizedDueDate =
          resolveDueDateKey({
            dueDate: dueDate || dueDateAlt,
            transactionDate,
            transactionDateKey,
            entryType: type,
            creditTermsDays,
            normalizeTransactionDate,
          }) || transactionDateKey;

        if (CREDIT_ENTRY_DEDUP_WINDOW_MS > 0) {
          const transactionDateCompareSql = "COALESCE(transaction_date::text, '')";
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
              const existing = await dbGetAsync('SELECT * FROM credit_history WHERE id = ?', [
                maybeDuplicate.id,
              ]);
              return {
                status: 200,
                payload: {
                  success: true,
                  deduplicated: true,
                  message: 'Duplicate submit prevented',
                  balance: Number(maybeDuplicate.balance || current),
                  transaction: existing,
                },
              };
            }
          }
        }

        const insertResult = await dbRunAsync(
          `INSERT INTO credit_history (
             user_id,
             type,
             amount,
             balance,
             description,
             reference,
             transaction_date,
             due_date,
             transaction_ts,
             created_by,
             client_request_id,
             source_type,
             source_id,
             source_label
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.userId,
            type,
            parsedAmount,
            next,
            normalizedDescription || null,
            normalizedReference || null,
            normalizedDate,
            normalizedDueDate,
            transactionTs,
            createdById || null,
            clientRequestId,
            'adjustment',
            null,
            normalizedReference || null,
          ]
        );

        const entryId = Number(insertResult.lastInsertRowid || 0) || null;
        if (entryId && String(imageBase64 || '').trim()) {
          const nextImagePath = await storeCreditEntryImage({
            imageBase64,
            userId: req.params.userId,
            entryId,
          });
          await dbRunAsync('UPDATE credit_history SET image_path = ? WHERE id = ?', [
            nextImagePath,
            entryId,
          ]);
        }

        await recalculateCreditBalancesForUser(req.params.userId);
        await rebuildCustomerPaymentIntelligence(req.params.userId);

        const transaction = await dbGetAsync('SELECT * FROM credit_history WHERE id = ?', [
          insertResult.lastInsertRowid,
        ]);
        return {
          status: 201,
          payload: {
            success: true,
            balance: Number(transaction?.balance || next),
            transaction,
          },
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
        const existingByRequest = await dbGetAsync(
          'SELECT * FROM credit_history WHERE client_request_id = ? LIMIT 1',
          [clientRequestId]
        );
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
      const status =
        Number(error?.status || 0) ||
        (message.includes('Invalid') || message.includes('positive') ? 400 : 500);
      return res.status(status).json({ error: message });
    }
  });
};

module.exports = { registerCreditLedgerCreateRoutes };
