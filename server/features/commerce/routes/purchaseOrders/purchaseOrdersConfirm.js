const { preparePurchaseOrderConfirmContext } = require('./confirm/confirmContext');
const { applyConfirmStockAdjustments } = require('./confirm/confirmStock');
const { applyConfirmLedgerEntries } = require('./confirm/confirmLedger');
const { updatePurchaseOrderOnConfirm } = require('./confirm/confirmUpdate');
const { buildConfirmResponse } = require('./confirm/confirmResponse');

const handlePurchaseOrderConfirm = async (deps, {
  req,
  res,
  order,
  currentPoStatus,
  billNumber,
}) => {
  const {
    dbTxAsync,
    logAdminAuditAsync,
    recordPurchaseOrderStatusHistoryAsync,
    PURCHASE_STOCK_CAP,
  } = deps;

  const contextResult = await preparePurchaseOrderConfirmContext(deps, {
    req,
    order,
    currentPoStatus,
    billNumber,
  });
  if (contextResult.error) {
    return res.status(contextResult.error.status).json(contextResult.error.body);
  }

  const {
    paymentMode,
    paymentReference,
    paymentNotes,
    delivered,
    paymentDate,
    confirmedAt,
    distributorId,
    totalSnapshot,
    stockAlreadyApplied,
    nextLifecycleStatus,
    nextAction,
    paymentDueDate,
  } = contextResult.data;

  let capAdjustments = [];
  let createdPaymentId = null;

  await dbTxAsync(async () => {
    const stockResult = await applyConfirmStockAdjustments(deps, {
      req,
      order,
      stockAlreadyApplied,
    });
    capAdjustments = stockResult.capAdjustments;

    const ledgerResult = await applyConfirmLedgerEntries(deps, {
      req,
      order,
      billNumber,
      distributorId,
      totalSnapshot,
      paymentMode,
      paymentReference,
      paymentNotes,
      paymentDate,
    });
    createdPaymentId = ledgerResult.createdPaymentId;

    await updatePurchaseOrderOnConfirm(deps, {
      req,
      billNumber,
      nextLifecycleStatus,
      totalSnapshot,
      paymentDueDate,
      nextAction,
      confirmedAt,
      delivered,
    });
  });

  const statusNote = delivered
    ? 'Purchase order confirmed and marked delivered'
    : 'Purchase order confirmed without delivery';

  await recordPurchaseOrderStatusHistoryAsync(req.params.id, {
    fromStatus: currentPoStatus,
    toStatus: nextLifecycleStatus,
    note: statusNote,
    billNumber: billNumber || null,
    paymentStatus: totalSnapshot.paymentStatus,
    balanceDue: totalSnapshot.balanceDue,
    createdBy: req.body?.updated_by || req.body?.created_by || null,
  });
  await logAdminAuditAsync(req, {
    action: 'purchase_order.status_update',
    entityType: 'purchase_order',
    entityId: req.params.id,
    details: {
      status: 'confirmed',
      po_status: nextLifecycleStatus,
        bill_number: billNumber || null,
        initial_paid_amount: totalSnapshot.paidAmount,
        balance_due: totalSnapshot.balanceDue,
        payment_status: totalSnapshot.paymentStatus,
        delivered,
        stock_applied: !stockAlreadyApplied,
        stock_already_applied: stockAlreadyApplied,
        cap_applied_count: capAdjustments.length,
      process_payment_id: createdPaymentId,
    },
  });

  return res.json(buildConfirmResponse({
    nextLifecycleStatus,
    totalSnapshot,
    paymentDueDate,
    stockAlreadyApplied,
    capAdjustments,
    PURCHASE_STOCK_CAP,
    delivered,
  }));
};

module.exports = { handlePurchaseOrderConfirm };
