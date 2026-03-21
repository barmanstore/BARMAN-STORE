const { buildBillDraft } = require('./billingCreate/billBuild');
const { persistBillDraft } = require('./billingCreate/billPersist');
const { notifyBillCreated } = require('./billingCreate/billNotifications');

const registerBillingCreateRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    isUniqueViolationError,
    logAdminAuditAsync,
  } = deps;

  app.post('/api/bills/create', requireAdmin, async (req, res) => {
    let clientRequestId = null;
    let linkedOrderId = 0;
    try {
      const buildResult = await buildBillDraft(deps, req);
      clientRequestId = buildResult.clientRequestId || null;
      linkedOrderId = Number(buildResult.linkedOrderId || 0) || 0;
      if (buildResult.dedupe) {
        return res.status(buildResult.dedupe.status).json(buildResult.dedupe.body);
      }
      const draft = buildResult.draft;
      draft.clientRequestId = clientRequestId;

      const { billId, createdBy } = await persistBillDraft(deps, req, draft);

      await logAdminAuditAsync(req, {
        action: 'bill.create',
        entityType: 'bill',
        entityId: billId,
        requestId: clientRequestId,
        details: {
          bill_number: draft.billNumber,
          customer_id: Number(draft.customer?.id || 0) || null,
          bill_type: draft.billType,
          total_amount: Number(draft.totalAmount || 0),
          credit_amount: Number(draft.creditAmount || 0),
          items_count: draft.itemFulfillmentRows.length,
          linked_order_id: draft.normalizedOrderId,
          stock_applied: draft.shouldApplySalesStock,
        },
      });
      try {
        await notifyBillCreated(deps, {
          customer: draft.customer,
          billId,
          billNumber: draft.billNumber,
          totalAmount: draft.totalAmount,
          creditAmount: draft.creditAmount,
          paidAmount: draft.paidAmount,
          normalizedOrderId: draft.normalizedOrderId,
          createdBy,
        });
      } catch (notifyError) {
        console.warn('[NOTIFY] bill creation notification failed:', notifyError?.message || notifyError);
      }
      const pendingQtyTotal = draft.itemFulfillmentRows.reduce((sum, it) => sum + Math.max(0, Number(it.pending_qty || 0)), 0);
      const fulfilledQtyTotal = draft.itemFulfillmentRows.reduce((sum, it) => sum + Math.max(0, Number(it.fulfilled_qty || 0)), 0);
      return res.status(201).json({
        success: true,
        bill_id: billId,
        bill_number: draft.billNumber,
        order_id: draft.normalizedOrderId,
        stock_applied: draft.shouldApplySalesStock,
        fulfilled_qty: Number(fulfilledQtyTotal || 0),
        pending_qty: Number(pendingQtyTotal || 0),
        fulfillment_mode: draft.fulfillmentMode,
      });
    } catch (error) {
      if (clientRequestId && isUniqueViolationError(error)) {
        const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE client_request_id = ? LIMIT 1`, [clientRequestId]);
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            bill_id: Number(existing.id),
            bill_number: existing.bill_number,
          });
        }
      }
      if (linkedOrderId && isUniqueViolationError(error)) {
        const existing = await dbGetAsync(`SELECT id, bill_number FROM bills WHERE order_id = ? LIMIT 1`, [linkedOrderId]);
        if (existing) {
          return res.status(200).json({
            success: true,
            deduplicated: true,
            bill_id: Number(existing.id),
            bill_number: existing.bill_number,
            reason: 'order_already_billed',
          });
        }
      }
      if (error.status === 409 && error.orderStatus) {
        return res.status(409).json({
          error: error.message,
          order_status: error.orderStatus,
        });
      }
      if (error.status === 400 && error.details) {
        return res.status(400).json({ error: error.message, details: error.details });
      }
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      return res.status(error.status || 500).json({ error: error.message });
    }
  });
};

module.exports = { registerBillingCreateRoutes };
