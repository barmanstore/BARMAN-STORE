const normalizeConfirmedDeliveredFlag = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (['true', '1', 'yes', 'y', 'on'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(raw)) return false;
  return fallback;
};

const preparePurchaseOrderConfirmContext = async (deps, { req, order, currentPoStatus, billNumber }) => {
  const {
    calculatePoPaymentSnapshot,
    computePurchasePaymentDueDate,
    derivePoLifecycleFromPaymentStatus,
    derivePurchaseNextAction,
    findDuplicateDistributorBillAsync,
    getDistributorByIdAsync,
    isPoEditableLifecycle,
    normalizeTransactionDate,
    PO_LIFECYCLE_CONFIRMED,
  } = deps;

  if (!isPoEditableLifecycle(currentPoStatus)) {
    return {
      error: {
        status: 400,
        body: { error: 'Only prepared, sent, or revised purchase orders can be confirmed' },
      },
    };
  }
  if (!billNumber) {
    return {
      error: {
        status: 400,
        body: { error: 'bill_number is required when confirming a purchase order' },
      },
    };
  }
  const duplicateBill = await findDuplicateDistributorBillAsync({
    distributorId: Number(order.distributor_id || 0),
    billNumber,
    excludeOrderId: Number(req.params.id || 0),
  });
  if (duplicateBill) {
    return {
      error: {
        status: 409,
        body: {
          error: `Bill number already exists for this distributor on ${duplicateBill.po_number}`,
          conflict_type: 'purchase_bill_duplicate',
          conflict: duplicateBill,
        },
      },
    };
  }

  const initialPaidAmountRaw = Number(
    req.body?.paid_amount ?? req.body?.initial_paid_amount ?? req.body?.payment_amount ?? 0
  );
  const initialPaidAmount = Math.max(0, initialPaidAmountRaw);
  const paymentMode = String(req.body?.payment_mode || 'cash').trim().toLowerCase() || 'cash';
  const paymentReference = String(req.body?.payment_reference || req.body?.reference || billNumber || '').trim() || null;
  const paymentNotes = String(req.body?.payment_notes || req.body?.notes || '').trim() || null;
  const delivered = normalizeConfirmedDeliveredFlag(req.body?.delivered, true);
  const paymentDate = normalizeTransactionDate(req.body?.payment_date || req.body?.transaction_date || new Date().toISOString());
  const confirmedAt = new Date().toISOString();
  const distributorId = Number(order.distributor_id || 0);
  const distributor = await getDistributorByIdAsync(distributorId);
  if (distributorId > 0 && !distributor) {
    return {
      error: {
        status: 400,
        body: { error: 'Purchase order distributor not found. Reassign the distributor before processing this PO.' },
      },
    };
  }
  const totalSnapshot = calculatePoPaymentSnapshot(Number(order.total_amount ?? order.total ?? 0), initialPaidAmount);
  if (initialPaidAmount > totalSnapshot.totalAmount) {
    return {
      error: {
        status: 400,
        body: { error: 'Initial paid amount cannot exceed PO total amount' },
      },
    };
  }

  const stockAlreadyApplied = Number(order.stock_applied_on_confirm || 0) === 1;
  const nextLifecycleStatus = derivePoLifecycleFromPaymentStatus(PO_LIFECYCLE_CONFIRMED, totalSnapshot.paymentStatus);
  const nextAction = derivePurchaseNextAction({
    ...order,
    po_status: nextLifecycleStatus,
    status: 'confirmed',
    payment_status: totalSnapshot.paymentStatus,
    balance_due: totalSnapshot.balanceDue,
  });
  const paymentDueDate = normalizeTransactionDate(order.strict_due_date)
    || computePurchasePaymentDueDate(
      distributor || {},
      paymentDate || order.planned_order_date || order.expected_delivery || order.created_at,
    );

  return {
    error: null,
    data: {
      initialPaidAmount,
      paymentMode,
      paymentReference,
      paymentNotes,
      delivered,
      paymentDate,
      confirmedAt,
      distributorId,
      distributor,
      totalSnapshot,
      stockAlreadyApplied,
      nextLifecycleStatus,
      nextAction,
      paymentDueDate,
    },
  };
};

module.exports = { preparePurchaseOrderConfirmContext };
