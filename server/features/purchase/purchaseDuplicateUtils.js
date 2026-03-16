const createPurchaseDuplicateUtils = (deps = {}) => {
  const {
    dbGetAsync,
    crypto,
    normalizeTransactionDate,
    PO_LIFECYCLE_CANCELLED,
  } = deps;

  const buildPurchaseOrderFingerprint = (items = []) => {
    const normalized = (Array.isArray(items) ? items : [])
      .map((item) => {
        const productKey = String(item?.product_id || item?.product_name || 'custom').trim().toLowerCase();
        const quantity = Number(item?.quantity || 0).toFixed(3);
        const uom = String(item?.uom || 'pcs').trim().toLowerCase();
        return `${productKey}:${quantity}:${uom}`;
      })
      .filter(Boolean)
      .sort();
    return crypto.createHash('sha1').update(normalized.join('|')).digest('hex');
  };

  const buildPurchaseDuplicateKey = ({ distributorId, plannedOrderDate, items = [] } = {}) => {
    if (!distributorId) return '';
    const fingerprint = buildPurchaseOrderFingerprint(items);
    const plannedDateKey = normalizeTransactionDate(plannedOrderDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    return `${distributorId}:${plannedDateKey}:${fingerprint}`;
  };

  const hashPurchaseLockKeyPart = (value) => {
    const raw = String(value || '');
    let hash = 0;
    for (let index = 0; index < raw.length; index += 1) {
      hash = ((hash * 31) + raw.charCodeAt(index)) | 0;
    }
    return hash;
  };

  const acquirePurchaseDuplicateLockAsync = async ({
    distributorId,
    plannedOrderDate,
    duplicateKey,
  } = {}) => {
    if (!duplicateKey || !distributorId) return;
    const plannedDateKey = normalizeTransactionDate(plannedOrderDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10);
    const lockScope = `purchase:${Number(distributorId || 0)}:${plannedDateKey}`;
    await dbGetAsync(
      `SELECT pg_advisory_xact_lock(CAST(? AS INTEGER), CAST(? AS INTEGER)) AS locked`,
      [hashPurchaseLockKeyPart(lockScope), hashPurchaseLockKeyPart(duplicateKey)]
    );
  };

  const findDuplicatePurchaseOrderAsync = async ({
    distributorId,
    plannedOrderDate,
    duplicateKey,
    excludeOrderId = null,
  } = {}) => {
    if (!distributorId || !duplicateKey) return null;
    let sql = `
      SELECT id, po_number, po_status, created_at
      FROM purchase_orders
      WHERE distributor_id = ?
        AND duplicate_key = ?
        AND planned_order_date = ?
        AND LOWER(COALESCE(po_status, status, '')) <> LOWER(?)
    `;
    const params = [
      distributorId,
      duplicateKey,
      normalizeTransactionDate(plannedOrderDate || new Date().toISOString()) || new Date().toISOString().slice(0, 10),
      PO_LIFECYCLE_CANCELLED,
    ];
    if (excludeOrderId) {
      sql += ` AND id <> ?`;
      params.push(excludeOrderId);
    }
    sql += ` ORDER BY created_at DESC LIMIT 1`;
    return dbGetAsync(sql, params);
  };

  const findDuplicateDistributorBillAsync = async ({ distributorId, billNumber, excludeOrderId = null } = {}) => {
    const normalizedBillNumber = String(billNumber || '').trim();
    if (!distributorId || !normalizedBillNumber) return null;
    let sql = `
      SELECT id, po_number, bill_number, invoice_number
      FROM purchase_orders
      WHERE distributor_id = ?
        AND LOWER(COALESCE(bill_number, invoice_number, '')) = LOWER(?)
        AND LOWER(COALESCE(po_status, status, '')) <> LOWER(?)
    `;
    const params = [distributorId, normalizedBillNumber, PO_LIFECYCLE_CANCELLED];
    if (excludeOrderId) {
      sql += ` AND id <> ?`;
      params.push(excludeOrderId);
    }
    sql += ` ORDER BY created_at DESC LIMIT 1`;
    return dbGetAsync(sql, params);
  };

  const findDuplicatePurchasePaymentAsync = async ({
    purchaseOrderId,
    distributorId,
    amount,
    reference,
    transactionDate,
    clientRequestId = null,
  } = {}) => {
    const normalizedAmount = Math.max(0, Number(amount || 0));
    const normalizedDate = normalizeTransactionDate(transactionDate);
    const normalizedReference = String(reference || '').trim().toLowerCase();
    if (clientRequestId) {
      const byRequestId = await dbGetAsync(
        `SELECT id, purchase_order_id, amount, payment_mode, reference, transaction_date
         FROM purchase_order_payments
         WHERE client_request_id = ?
         LIMIT 1`,
        [clientRequestId]
      );
      if (byRequestId) return byRequestId;
    }
    if (!purchaseOrderId || !distributorId || normalizedAmount <= 0 || !normalizedDate) return null;
    return dbGetAsync(
      `SELECT id, purchase_order_id, amount, payment_mode, reference, transaction_date
       FROM purchase_order_payments
       WHERE purchase_order_id = ?
         AND distributor_id = ?
         AND ABS(COALESCE(amount, 0) - ?) < 0.0001
         AND LOWER(COALESCE(reference, '')) = ?
         AND transaction_date = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [purchaseOrderId, distributorId, normalizedAmount, normalizedReference, normalizedDate]
    );
  };

  return {
    acquirePurchaseDuplicateLockAsync,
    buildPurchaseDuplicateKey,
    findDuplicatePurchaseOrderAsync,
    findDuplicateDistributorBillAsync,
    findDuplicatePurchasePaymentAsync,
  };
};

module.exports = { createPurchaseDuplicateUtils };
