const createPurchaseOrderStatusUtils = (deps = {}) => {
  const {
    dbRunAsync,
    PO_LIFECYCLE_PREPARED,
    PO_LIFECYCLE_SENT,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_CONFIRMED,
    PO_LIFECYCLE_PART_PAID,
    PO_LIFECYCLE_FULLY_PAID,
    PO_LIFECYCLE_CLOSED,
    PO_LIFECYCLE_CANCELLED,
    PO_PAYMENT_UNPAID,
    PO_PAYMENT_PART_PAID,
    PO_PAYMENT_PAID,
  } = deps;

  const PO_EDITABLE_STATUSES = new Set([PO_LIFECYCLE_PREPARED, PO_LIFECYCLE_SENT, PO_LIFECYCLE_REVISED]);
  const PO_PAYMENT_ALLOWED_STATUSES = new Set([PO_LIFECYCLE_CONFIRMED, PO_LIFECYCLE_PART_PAID, PO_LIFECYCLE_FULLY_PAID]);
  const PO_RECEIVE_ALLOWED_STATUSES = new Set([PO_LIFECYCLE_CONFIRMED, PO_LIFECYCLE_PART_PAID, PO_LIFECYCLE_FULLY_PAID]);

  const normalizePoLifecycleStatus = (status, fallback = PO_LIFECYCLE_PREPARED) => {
    const raw = String(status || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === PO_LIFECYCLE_PREPARED || raw === 'registered' || raw === 'pending' || raw === 'draft') return PO_LIFECYCLE_PREPARED;
    if (raw === PO_LIFECYCLE_SENT) return PO_LIFECYCLE_SENT;
    if (raw === PO_LIFECYCLE_REVISED || raw === 'edited') return PO_LIFECYCLE_REVISED;
    if (raw === PO_LIFECYCLE_CONFIRMED || raw === 'processed' || raw === 'shipped' || raw === 'received') return PO_LIFECYCLE_CONFIRMED;
    if (raw === PO_LIFECYCLE_PART_PAID || raw === 'partial_paid') return PO_LIFECYCLE_PART_PAID;
    if (raw === PO_LIFECYCLE_FULLY_PAID || raw === 'full_paid' || raw === 'paid') return PO_LIFECYCLE_FULLY_PAID;
    if (raw === PO_LIFECYCLE_CLOSED) return PO_LIFECYCLE_CLOSED;
    if (raw === PO_LIFECYCLE_CANCELLED || raw === 'canceled') return PO_LIFECYCLE_CANCELLED;
    return fallback;
  };

  const getPurchaseOrderLifecycleStatus = (order, fallback = PO_LIFECYCLE_PREPARED) => {
    if (!order) return fallback;
    return normalizePoLifecycleStatus(order.po_status || order.status, fallback);
  };

  const normalizePoPaymentStatus = (value, fallback = PO_PAYMENT_UNPAID) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return fallback;
    if (raw === PO_PAYMENT_UNPAID || raw === 'pending') return PO_PAYMENT_UNPAID;
    if (raw === PO_PAYMENT_PART_PAID || raw === 'partpaid' || raw === 'partial') return PO_PAYMENT_PART_PAID;
    if (raw === PO_PAYMENT_PAID) return PO_PAYMENT_PAID;
    return fallback;
  };

  const calculatePoPaymentSnapshot = (totalAmountValue, paidAmountValue = 0) => {
    const totalAmount = Math.max(0, Number(totalAmountValue || 0));
    const paidAmountRaw = Math.max(0, Number(paidAmountValue || 0));
    const paidAmount = Math.min(totalAmount, paidAmountRaw);
    const balanceDue = Math.max(0, totalAmount - paidAmount);
    let paymentStatus = PO_PAYMENT_UNPAID;
    if (totalAmount > 0 && paidAmount >= totalAmount) {
      paymentStatus = PO_PAYMENT_PAID;
    } else if (paidAmount > 0) {
      paymentStatus = PO_PAYMENT_PART_PAID;
    }
    return {
      totalAmount,
      paidAmount,
      balanceDue,
      paymentStatus,
    };
  };

  const derivePoLifecycleFromPaymentStatus = (baseStatus, paymentStatus) => {
    const normalizedBase = normalizePoLifecycleStatus(baseStatus, PO_LIFECYCLE_CONFIRMED);
    if (normalizedBase === PO_LIFECYCLE_CANCELLED || normalizedBase === PO_LIFECYCLE_CLOSED) return normalizedBase;
    const normalizedPaymentStatus = normalizePoPaymentStatus(paymentStatus, PO_PAYMENT_UNPAID);
    if (normalizedPaymentStatus === PO_PAYMENT_PAID) return PO_LIFECYCLE_FULLY_PAID;
    if (normalizedPaymentStatus === PO_PAYMENT_PART_PAID) return PO_LIFECYCLE_PART_PAID;
    if (PO_EDITABLE_STATUSES.has(normalizedBase)) return normalizedBase;
    return PO_LIFECYCLE_CONFIRMED;
  };

  const isPoEditableLifecycle = (status) => PO_EDITABLE_STATUSES.has(normalizePoLifecycleStatus(status));
  const canPoAcceptPayment = (status) => PO_PAYMENT_ALLOWED_STATUSES.has(normalizePoLifecycleStatus(status));
  const canPoReceiveInventory = (status) => PO_RECEIVE_ALLOWED_STATUSES.has(normalizePoLifecycleStatus(status));

  const hasOrderBeenReceived = (order = {}) => {
    if (String(order?.status || '').trim().toLowerCase() === 'received') return true;
    if (order?.received_at) return true;
    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) return false;
    return items.every((item) => Number(item?.received_quantity || 0) >= Number(item?.quantity || 0));
  };

  const derivePurchaseNextAction = (order = {}) => {
    const lifecycleStatus = getPurchaseOrderLifecycleStatus(order);
    const paymentStatus = normalizePoPaymentStatus(order.payment_status, PO_PAYMENT_UNPAID);
    const balanceDue = Math.max(0, Number(order.balance_due || 0));
    if (lifecycleStatus === PO_LIFECYCLE_CANCELLED) return 'Cancelled';
    if (lifecycleStatus === PO_LIFECYCLE_CLOSED) return 'Closed';
    if (lifecycleStatus === PO_LIFECYCLE_PREPARED) return 'Send to distributor';
    if (lifecycleStatus === PO_LIFECYCLE_SENT || lifecycleStatus === PO_LIFECYCLE_REVISED) return 'Confirm with bill';
    if (!hasOrderBeenReceived(order)) return 'Receive delivery';
    if (paymentStatus !== PO_PAYMENT_PAID && balanceDue > 0) return 'Collect payment';
    if (lifecycleStatus === PO_LIFECYCLE_FULLY_PAID) return 'Close PO';
    return 'Monitor';
  };

  const recordPurchaseOrderStatusHistoryAsync = async (purchaseOrderId, {
    fromStatus = null,
    toStatus,
    note = null,
    billNumber = null,
    paymentStatus = null,
    balanceDue = null,
    createdBy = null,
  } = {}) => {
    if (!purchaseOrderId || !toStatus) return;
    await dbRunAsync(
      `INSERT INTO purchase_order_status_history
       (purchase_order_id, from_status, to_status, note, bill_number, payment_status, balance_due, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        purchaseOrderId,
        fromStatus || null,
        normalizePoLifecycleStatus(toStatus),
        note || null,
        billNumber || null,
        paymentStatus ? normalizePoPaymentStatus(paymentStatus) : null,
        balanceDue === null || balanceDue === undefined ? null : Number(balanceDue || 0),
        createdBy || null,
      ]
    );
  };

  return {
    normalizePoLifecycleStatus,
    getPurchaseOrderLifecycleStatus,
    normalizePoPaymentStatus,
    calculatePoPaymentSnapshot,
    derivePoLifecycleFromPaymentStatus,
    isPoEditableLifecycle,
    canPoAcceptPayment,
    canPoReceiveInventory,
    derivePurchaseNextAction,
    recordPurchaseOrderStatusHistoryAsync,
  };
};

module.exports = { createPurchaseOrderStatusUtils };
