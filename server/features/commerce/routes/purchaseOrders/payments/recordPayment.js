const recordPurchaseOrderPayment = async ({
  orderId,
  body,
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
}) => {
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
        orderId,
        distributorId,
        amount,
        paymentMode,
        reference,
        notes,
        transactionDate,
        body?.created_by || body?.authUserId || null,
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
        reference: reference || order.po_number || `PO-${orderId}`,
        bill_number: order.bill_number || order.invoice_number || null,
        description: `PO payment for ${order.po_number || orderId}`,
        transaction_date: transactionDate || new Date().toISOString().slice(0, 10),
        source: 'po_payment',
        source_id: paymentId,
        created_by: body?.created_by || body?.authUserId || null,
      });
    }

    nextSnapshot = calculatePoPaymentSnapshot(
      totalSnapshotBefore.totalAmount,
      totalSnapshotBefore.paidAmount + amount
    );
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
      [
        nextPoStatus,
        nextSnapshot.paymentStatus,
        nextSnapshot.paidAmount,
        nextSnapshot.balanceDue,
        nextAction,
        orderId,
      ]
    );
  });

  return {
    paymentId,
    nextSnapshot,
    nextPoStatus,
    nextAction,
  };
};

module.exports = { recordPurchaseOrderPayment };
