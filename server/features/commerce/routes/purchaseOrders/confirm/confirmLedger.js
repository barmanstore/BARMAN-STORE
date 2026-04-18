const applyConfirmLedgerEntries = async (
  deps,
  {
    req,
    order,
    billNumber,
    distributorId,
    totalSnapshot,
    paymentMode,
    paymentReference,
    paymentNotes,
    paymentDate,
  }
) => {
  const { dbGetAsync, dbRunAsync, createDistributorLedgerEntry } = deps;

  let createdPaymentId = null;

  const existingPoCredit = await dbGetAsync(
    `SELECT id
     FROM distributor_ledger
     WHERE distributor_id = ?
       AND source = 'purchase_order'
       AND LOWER(type) = 'credit'
       AND (source_id = ? OR source_id = ?)
     ORDER BY id DESC
     LIMIT 1`,
    [order.distributor_id, String(req.params.id), `${req.params.id}.0`]
  );
  if (!existingPoCredit && distributorId > 0 && totalSnapshot.totalAmount > 0) {
    await createDistributorLedgerEntry(order.distributor_id, {
      type: 'credit',
      transaction_type: 'credit',
      amount: totalSnapshot.totalAmount,
      payment_mode: 'credit',
      reference: order.po_number || `PO-${req.params.id}`,
      bill_number: billNumber || null,
      description:
        `Purchase Order ${order.po_number || req.params.id}${billNumber ? ` (Bill: ${billNumber})` : ''}`.trim(),
      transaction_date: paymentDate || new Date().toISOString().slice(0, 10),
      source: 'purchase_order',
      source_id: req.params.id,
      created_by: req.body?.updated_by || req.body?.created_by || null,
    });
  }

  if (totalSnapshot.paidAmount > 0 && distributorId > 0) {
    const paymentResult = await dbRunAsync(
      `INSERT INTO purchase_order_payments
       (purchase_order_id, distributor_id, amount, payment_mode, reference, notes, transaction_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id,
        order.distributor_id,
        totalSnapshot.paidAmount,
        paymentMode,
        paymentReference,
        paymentNotes,
        paymentDate,
        req.body?.updated_by || req.body?.created_by || null,
      ]
    );
    createdPaymentId = Number(paymentResult.lastInsertRowid || 0) || null;
    if (createdPaymentId) {
      await createDistributorLedgerEntry(order.distributor_id, {
        type: 'payment',
        transaction_type: 'payment',
        amount: totalSnapshot.paidAmount,
        payment_mode: paymentMode,
        reference: paymentReference || order.po_number || `PO-${req.params.id}`,
        bill_number: billNumber || null,
        description: `PO payment on confirmation ${order.po_number || req.params.id}`,
        transaction_date: paymentDate || new Date().toISOString().slice(0, 10),
        source: 'po_payment',
        source_id: createdPaymentId,
        created_by: req.body?.updated_by || req.body?.created_by || null,
      });
    }
  }

  return { createdPaymentId };
};

module.exports = { applyConfirmLedgerEntries };
