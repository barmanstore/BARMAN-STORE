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
      const idempotency = resolveClientRequestId(req);
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.value;
      const order = await dbGetAsync(`SELECT * FROM purchase_orders WHERE id = ?`, [req.params.id]);
      if (!order) return res.status(404).json({ error: 'Purchase order not found' });
      const poStatus = getPurchaseOrderLifecycleStatus(order);
      if (!canPoAcceptPayment(poStatus)) {
        return res.status(400).json({ error: 'Payments are allowed only for confirmed purchase orders' });
      }

      const amount = Math.max(0, Number(req.body?.amount || 0));
      if (amount <= 0) return res.status(400).json({ error: 'amount must be greater than 0' });
      const distributorId = Number(order.distributor_id || 0);
      if (!distributorId) {
        return res.status(400).json({ error: 'Purchase order distributor is missing. Reassign the distributor before recording payment.' });
      }
      const distributor = await getDistributorByIdAsync(distributorId);
      if (!distributor) {
        return res.status(400).json({ error: 'Purchase order distributor not found. Reassign the distributor before recording payment.' });
      }

      const totalSnapshotBefore = calculatePoPaymentSnapshot(
        Number(order.total_amount ?? order.total ?? 0),
        Number(order.paid_amount || 0)
      );
      if (amount > totalSnapshotBefore.balanceDue) {
        return res.status(400).json({ error: 'Payment amount cannot exceed balance due' });
      }

      const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
      const reference = String(req.body?.reference || req.body?.payment_reference || order.bill_number || order.po_number || '').trim() || null;
      const notes = String(req.body?.notes || req.body?.description || '').trim() || null;
      const transactionDate = normalizeTransactionDate(req.body?.transaction_date || req.body?.payment_date || null);
      const duplicatePayment = await findDuplicatePurchasePaymentAsync({
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
      let paymentId = null;
      let nextSnapshot = totalSnapshotBefore;
      let nextPoStatus = poStatus;
      let nextAction = derivePurchaseNextAction(order);

      await dbTxAsync(async () => {
        const paymentResult = await dbRunAsync(
          `INSERT INTO purchase_order_payments
           (purchase_order_id, distributor_id, amount, payment_mode, reference, notes, transaction_date, created_by, client_request_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            req.params.id,
            distributorId,
            amount,
            paymentMode,
            reference,
            notes,
            transactionDate,
            req.body?.created_by || req?.authUser?.id || null,
            clientRequestId,
          ]
        );
        paymentId = Number(paymentResult.lastInsertRowid || 0) || null;

        if (paymentId && distributorId > 0) {
          await createDistributorLedgerEntry(distributorId, {
            type: 'payment',
            transaction_type: 'payment',
            amount,
            payment_mode: paymentMode,
            reference: reference || order.po_number || `PO-${req.params.id}`,
            bill_number: order.bill_number || order.invoice_number || null,
            description: `PO payment for ${order.po_number || req.params.id}`,
            transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
            source: 'po_payment',
            source_id: paymentId,
            created_by: req.body?.created_by || req?.authUser?.id || null,
          });
        }

        nextSnapshot = calculatePoPaymentSnapshot(totalSnapshotBefore.totalAmount, totalSnapshotBefore.paidAmount + amount);
        nextPoStatus = derivePoLifecycleFromPaymentStatus(poStatus, nextSnapshot.paymentStatus);
        nextAction = derivePurchaseNextAction({
          ...order,
          po_status: nextPoStatus,
          payment_status: nextSnapshot.paymentStatus,
          balance_due: nextSnapshot.balanceDue,
        });
        await dbRunAsync(
          `UPDATE purchase_orders
           SET po_status = ?,
               payment_status = ?,
               paid_amount = ?,
               balance_due = ?,
               last_payment_at = CURRENT_TIMESTAMP,
               next_action = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [nextPoStatus, nextSnapshot.paymentStatus, nextSnapshot.paidAmount, nextSnapshot.balanceDue, nextAction, req.params.id]
        );
      });

      if (nextPoStatus !== poStatus) {
        await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
          fromStatus: poStatus,
          toStatus: nextPoStatus,
          note: 'Payment recorded for purchase order',
          billNumber: order.bill_number || order.invoice_number || null,
          paymentStatus: nextSnapshot.paymentStatus,
          balanceDue: nextSnapshot.balanceDue,
          createdBy: req.body?.created_by || req?.authUser?.id || null,
        });
      }

      await logAdminAuditAsync(req, {
        action: 'purchase_order.payment_add',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          amount,
          payment_mode: paymentMode,
          reference,
          payment_id: paymentId,
          payment_status: nextSnapshot.paymentStatus,
          paid_amount: nextSnapshot.paidAmount,
          balance_due: nextSnapshot.balanceDue,
        },
      });

      return res.status(201).json({
        success: true,
        payment_id: paymentId,
        po_status: nextPoStatus,
        payment_status: nextSnapshot.paymentStatus,
        paid_amount: nextSnapshot.paidAmount,
        balance_due: nextSnapshot.balanceDue,
      });
    } catch (error) {
      if (clientRequestId && isUniqueViolationError(error)) {
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
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersPaymentsRoutes };
