const { resolvePurchasePaymentIdempotency } = require('./payments/resolveIdempotency');
const { validatePurchaseOrderPayment } = require('./payments/validatePayment');
const { checkDuplicatePurchasePayment } = require('./payments/checkDuplicate');
const { recordPurchaseOrderPayment } = require('./payments/recordPayment');
const { logPurchaseOrderPaymentAudit } = require('./payments/logAudit');

const registerPurchaseOrdersPaymentsRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    calculatePoPaymentSnapshot,
    canPoAcceptPayment,
    createDistributorLedgerEntry,
    derivePoLifecycleFromPaymentStatus,
    derivePurchaseNextAction,
    findDuplicatePurchasePaymentAsync,
    getDistributorByIdAsync,
    getPurchaseOrderLifecycleStatus,
    isUniqueViolationError,
    logAdminAuditAsync,
    normalizePoPaymentStatus,
    normalizeTransactionDate,
    recordPurchaseOrderStatusHistoryAsync,
    resolveClientRequestId,
    PO_PAYMENT_UNPAID,
  } = deps;

  app.post('/api/purchase-orders/:id/payments', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    try {
      const idempotency = resolvePurchasePaymentIdempotency(req, resolveClientRequestId);
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.clientRequestId;

      const validation = await validatePurchaseOrderPayment({
        orderId: req.params.id,
        body: req.body,
        dbGetAsync,
        getDistributorByIdAsync,
        getPurchaseOrderLifecycleStatus,
        canPoAcceptPayment,
        calculatePoPaymentSnapshot,
      });
      const {
        order,
        poStatus,
        amount,
        distributorId,
        totalSnapshotBefore,
      } = validation;

      const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
      const reference = String(req.body?.reference || req.body?.payment_reference || order.bill_number || order.po_number || '').trim() || null;
      const notes = String(req.body?.notes || req.body?.description || '').trim() || null;
      const transactionDate = normalizeTransactionDate(req.body?.transaction_date || req.body?.payment_date || null);
      const duplicatePayment = await checkDuplicatePurchasePayment({
        findDuplicatePurchasePaymentAsync,
        purchaseOrderId: Number(req.params.id || 0),
        distributorId: Number(order.distributor_id || 0),
        amount,
        reference,
        transactionDate,
        clientRequestId,
      });
      if (duplicatePayment) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          payment_id: Number(duplicatePayment.id || 0),
          payment_status: normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID),
          paid_amount: Number(order.paid_amount || 0),
          balance_due: Number(order.balance_due || 0),
        });
      }
      const record = await recordPurchaseOrderPayment({
        orderId: req.params.id,
        body: {
          ...req.body,
          authUserId: req?.authUser?.id || null,
        },
        order,
        poStatus,
        amount,
        distributorId,
        paymentMode,
        reference,
        notes,
        transactionDate,
        clientRequestId,
        totalSnapshotBefore,
        dbTxAsync,
        dbRunAsync,
        createDistributorLedgerEntry,
        calculatePoPaymentSnapshot,
        derivePoLifecycleFromPaymentStatus,
        derivePurchaseNextAction,
      });

      if (record.nextPoStatus !== poStatus) {
        await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
          fromStatus: poStatus,
          toStatus: record.nextPoStatus,
          note: 'Payment recorded for purchase order',
          billNumber: order.bill_number || order.invoice_number || null,
          paymentStatus: record.nextSnapshot.paymentStatus,
          balanceDue: record.nextSnapshot.balanceDue,
          createdBy: req.body?.created_by || req?.authUser?.id || null,
        });
      }

      await logPurchaseOrderPaymentAudit({
        req,
        logAdminAuditAsync,
        orderId: req.params.id,
        amount,
        paymentMode,
        reference,
        paymentId: record.paymentId,
        paymentStatus: record.nextSnapshot.paymentStatus,
        paidAmount: record.nextSnapshot.paidAmount,
        balanceDue: record.nextSnapshot.balanceDue,
      });

      return res.status(201).json({
        success: true,
        payment_id: record.paymentId,
        po_status: record.nextPoStatus,
        payment_status: record.nextSnapshot.paymentStatus,
        paid_amount: record.nextSnapshot.paidAmount,
        balance_due: record.nextSnapshot.balanceDue,
      });
    } catch (error) {
      const uniqueViolation = clientRequestId
        && typeof isUniqueViolationError === 'function'
        && isUniqueViolationError(error);
      if (uniqueViolation) {
        const existing = await dbGetAsync(
          `SELECT id FROM purchase_order_payments WHERE client_request_id = ? LIMIT 1`,
          [clientRequestId]
        );
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            payment_id: Number(existing.id || 0),
          });
        }
      }
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersPaymentsRoutes };
