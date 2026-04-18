const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const { resolveCreditTermsDays } = require('../../../utils/creditStatusPolicy');

const addDaysToDateKey = (dateKey, days) => {
  if (!DATE_KEY_PATTERN.test(String(dateKey || '').trim())) return '';
  const [year, month, day] = dateKey.split('-').map((v) => Number(v));
  const baseMs = Date.UTC(year, month - 1, day);
  const safeDays = Math.max(0, Math.floor(Number(days || 0)));
  const next = new Date(baseMs + safeDays * DAY_MS);
  return next.toISOString().slice(0, 10);
};

const resolveCreditIssue = async ({
  req,
  issueId,
  dbGetAsync,
  dbRunAsync,
  dbTxAsync,
  createAppNotification,
  logAdminAuditAsync,
  normalizeCreditIssueStatus,
  getLatestCreditEntryAsync,
  getCustomerCreditProfileAsync,
  getCustomerPaymentSummaryAsync,
  recalculateCreditBalancesForUser,
  rebuildCustomerPaymentIntelligence,
  normalizeTransactionDate,
  buildCreditTransactionTimestamp,
} = {}) => {
  const requestedAction = String(req.body?.action || req.body?.status || '')
    .trim()
    .toLowerCase();
  let status = normalizeCreditIssueStatus(requestedAction, { fallback: '' });
  if (!status) {
    if (
      requestedAction === 'correct' ||
      requestedAction === 'mark_corrected' ||
      requestedAction === 'resolved'
    ) {
      status = 'corrected';
    } else if (requestedAction === 'reject' || requestedAction === 'mark_rejected') {
      status = 'rejected';
    } else if (requestedAction === 'review' || requestedAction === 'mark_in_review') {
      status = 'in_review';
    }
  }

  const adminReason =
    String(req.body?.admin_reason || req.body?.resolution_note || '').trim() || null;

  const correctionType = String(req.body?.correction_type || '')
    .trim()
    .toLowerCase();
  const correctionAmount = Number(req.body?.correction_amount || 0);
  const correctionDescription = String(req.body?.correction_description || '').trim();
  const correctionReference = String(req.body?.correction_reference || '').trim();
  const correctionDateRaw = String(req.body?.correction_date || '').trim();
  const normalizedCorrectionDate = correctionDateRaw
    ? normalizeTransactionDate(correctionDateRaw)
    : null;
  if (correctionDateRaw && !normalizedCorrectionDate) {
    const error = new Error('correction_date must be YYYY-MM-DD');
    error.status = 400;
    throw error;
  }
  const shouldCreateCorrectionEntry =
    (correctionType === 'given' || correctionType === 'payment') &&
    Number.isFinite(correctionAmount) &&
    correctionAmount > 0;
  if (!status) {
    if (shouldCreateCorrectionEntry) {
      status = 'corrected';
    } else if (adminReason) {
      status = 'rejected';
    } else {
      status = 'in_review';
    }
  }
  if (status === 'rejected' && !adminReason) {
    const error = new Error('Reason is required when rejecting an issue');
    error.status = 400;
    throw error;
  }
  const shouldInsertCorrection = status === 'corrected' && shouldCreateCorrectionEntry;

  const updated = await dbTxAsync(async () => {
    const existing = await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [issueId]);
    if (!existing) {
      const notFound = new Error('Credit issue not found');
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }

    let correctionEntryId = Number(existing.correction_entry_id || 0) || null;
    if (shouldInsertCorrection) {
      const userId = Number(existing.user_id || 0);
      const latest = await getLatestCreditEntryAsync(userId);
      const currentBalance = Number(latest?.balance || 0);
      const amountAbs = Math.abs(correctionAmount);
      const nextBalance =
        correctionType === 'payment' ? currentBalance - amountAbs : currentBalance + amountAbs;
      const derivedDescription =
        correctionDescription ||
        `Correction for issue #${issueId}${adminReason ? `: ${adminReason}` : ''}`;
      const transactionTs = buildCreditTransactionTimestamp(correctionDateRaw, new Date());
      const transactionDateKey =
        normalizedCorrectionDate || String(transactionTs || '').slice(0, 10);
      const creditProfile = await getCustomerCreditProfileAsync(userId);
      const paymentSummary = await getCustomerPaymentSummaryAsync(userId);
      const creditTermsDays = resolveCreditTermsDays({
        creditTermsDays: creditProfile?.credit_terms_days,
        paymentSummary,
      });
      const dueDate =
        correctionType === 'payment'
          ? transactionDateKey
          : addDaysToDateKey(transactionDateKey, creditTermsDays) || transactionDateKey;
      const insert = await dbRunAsync(
        `INSERT INTO credit_history
         (
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [
          userId,
          correctionType,
          amountAbs,
          nextBalance,
          derivedDescription,
          correctionReference || `ISSUE-${issueId}`,
          transactionDateKey,
          dueDate,
          transactionTs,
          Number(req.authUser?.id || 0) || null,
          'issue_correction',
          String(issueId),
          correctionReference || `ISSUE-${issueId}`,
        ]
      );
      correctionEntryId = Number(insert.lastInsertRowid || 0) || null;
      await recalculateCreditBalancesForUser(userId);
      await rebuildCustomerPaymentIntelligence(userId);
    }

    const isFinal = status === 'corrected' || status === 'rejected';
    await dbRunAsync(
      `UPDATE credit_entry_issues
       SET status = ?,
           resolution_note = ?,
           admin_reason = ?,
           resolved_by = ?,
           resolved_at = ?,
           correction_entry_id = ?,
           customer_response_status = ?,
           customer_response_note = NULL,
           customer_response_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        status,
        adminReason,
        adminReason,
        Number(req.authUser?.id || 0) || null,
        isFinal ? new Date().toISOString() : null,
        correctionEntryId,
        isFinal ? 'pending' : null,
        issueId,
      ]
    );
    return await dbGetAsync(`SELECT * FROM credit_entry_issues WHERE id = ?`, [issueId]);
  });

  const issueDetails = await dbGetAsync(
    `SELECT cei.*,
            u.name as user_name,
            u.email as user_email,
            corr.amount as correction_amount,
            corr.type as correction_type,
            corr.reference as correction_reference
     FROM credit_entry_issues cei
     LEFT JOIN users u ON u.id = cei.user_id
     LEFT JOIN credit_history corr ON corr.id = cei.correction_entry_id
     WHERE cei.id = ?`,
    [issueId]
  );

  if (Number(updated?.user_id || 0)) {
    await createAppNotification({
      userId: Number(updated.user_id),
      title: 'Credit issue updated',
      message: `Issue #${issueId} marked as ${status.replace(/_/g, ' ')}${adminReason ? `: ${adminReason}` : ''}`,
      level: status === 'corrected' ? 'success' : status === 'rejected' ? 'warning' : 'info',
      entityType: 'credit_entry_issue',
      entityId: issueId,
      issueId,
      metadata: {
        status,
        user_id: Number(updated?.user_id || 0) || null,
        issue_id: issueId,
        credit_entry_id: Number(updated?.credit_entry_id || 0) || null,
        correction_entry_id: Number(updated?.correction_entry_id || 0) || null,
      },
      createdBy: Number(req.authUser?.id || 0) || null,
    });
  }

  await logAdminAuditAsync(req, {
    action: 'credit_issue.update',
    entityType: 'credit_entry_issue',
    entityId: issueId,
    details: {
      status,
      resolution_note: adminReason,
      user_id: Number(updated?.user_id || 0),
      credit_entry_id: Number(updated?.credit_entry_id || 0),
      correction_entry_id: Number(updated?.correction_entry_id || 0),
    },
  });

  return {
    updated,
    issueDetails,
  };
};

module.exports = { resolveCreditIssue };
