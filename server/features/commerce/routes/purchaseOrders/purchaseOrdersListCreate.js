const { resolvePurchaseOrderIdempotency } = require('./listCreate/resolveIdempotency');
const { validatePurchaseOrderInput } = require('./listCreate/validateInput');
const { buildPurchaseOrderContext } = require('./listCreate/buildContext');
const { createPurchaseOrderTransaction } = require('./listCreate/createTransaction');
const { logPurchaseOrderCreateAudit } = require('./listCreate/logAudit');

const registerPurchaseOrdersListCreateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    acquirePurchaseDuplicateLockAsync,
    buildPurchaseDuplicateKey,
    buildPurchaseTransactionTimestamp,
    calculatePoPaymentSnapshot,
    computePurchasePaymentDueDate,
    createPurchaseConflictError,
    findDuplicatePurchaseOrderAsync,
    generatePONumber,
    getDistributorByIdAsync,
    getSupplierByIdAsync,
    isUniqueViolationError,
    logAdminAuditAsync,
    normalizePurchaseOrderItems,
    normalizeTransactionDate,
    recordProductCostHistoryEntryAsync,
    recordPurchaseOrderStatusHistoryAsync,
    resolveClientRequestId,
    syncDistributorProductsSuppliedAsync,
    upsertSupplierProductsAsync,
    PO_LIFECYCLE_PREPARED,
  } = deps;

  app.post('/api/purchase-orders', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    try {
      const b = req.body || {};
      const idempotency = await resolvePurchaseOrderIdempotency({
        req,
        resolveClientRequestId,
        dbGetAsync,
      });
      if (idempotency.error) return res.status(400).json({ error: idempotency.error });
      clientRequestId = idempotency.clientRequestId;
      if (idempotency.existing) {
        return res.status(200).json({
          success: true,
          deduplicated: true,
          id: Number(idempotency.existing.id),
          po_number: idempotency.existing.po_number,
        });
      }

      const { distributor, supplier, distributorId, supplierId, normalizedItems } =
        await validatePurchaseOrderInput({
          body: b,
          getDistributorByIdAsync,
          getSupplierByIdAsync,
          normalizePurchaseOrderItems,
        });

      const context = buildPurchaseOrderContext({
        body: {
          ...b,
          distributor_id: distributorId,
          supplier_id: supplierId || b.supplier_id || null,
        },
        distributor,
        normalizedItems,
        buildPurchaseDuplicateKey,
        normalizeTransactionDate,
        calculatePoPaymentSnapshot,
        computePurchasePaymentDueDate,
      });

      const poNumber = generatePONumber();
      const { orderId } = await createPurchaseOrderTransaction({
        body: {
          ...b,
          distributor_id: distributorId,
          supplier_id: supplierId || b.supplier_id || null,
        },
        poNumber,
        clientRequestId,
        context,
        normalizedItems,
        acquirePurchaseDuplicateLockAsync,
        findDuplicatePurchaseOrderAsync,
        createPurchaseConflictError,
        dbTxAsync,
        dbRunAsync,
        dbGetAsync,
        buildPurchaseTransactionTimestamp,
        recordProductCostHistoryEntryAsync,
        upsertSupplierProductsAsync,
        recordPurchaseOrderStatusHistoryAsync,
        PO_LIFECYCLE_PREPARED,
      });

      await syncDistributorProductsSuppliedAsync(Number(distributorId || 0), normalizedItems, {
        supplierId: supplierId || b.supplier_id || null,
      });
      await logPurchaseOrderCreateAudit({
        req,
        logAdminAuditAsync,
        clientRequestId,
        orderId,
        poNumber,
        totalAmount: context.totalAmount,
        normalizedItems,
        distributorId,
      });
      return res.status(201).json({
        success: true,
        id: orderId,
        po_number: poNumber,
        po_status: PO_LIFECYCLE_PREPARED,
        payment_status: context.paymentSnapshot.paymentStatus,
        paid_amount: context.paymentSnapshot.paidAmount,
        balance_due: context.paymentSnapshot.balanceDue,
        payment_due_date: context.paymentDueDate,
        strict_due_date: context.strictDueDate,
      });
    } catch (error) {
      if (clientRequestId && isUniqueViolationError(error)) {
        const existing = await dbGetAsync(
          'SELECT id, po_number FROM purchase_orders WHERE client_request_id = ? LIMIT 1',
          [clientRequestId]
        );
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            id: Number(existing.id),
            po_number: existing.po_number,
          });
        }
      }
      if (error.status === 400) {
        return res.status(400).json({ error: error.message, details: error.details || undefined });
      }
      if (error.status === 404) {
        return res.status(404).json({ error: error.message });
      }
      if (error.status === 409) {
        return res.status(409).json({
          error: error.message,
          conflict_type: error.conflictType || undefined,
          conflict: error.conflict || undefined,
        });
      }
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerPurchaseOrdersListCreateRoutes };
