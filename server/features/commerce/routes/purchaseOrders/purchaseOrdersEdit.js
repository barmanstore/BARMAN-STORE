const { updatePurchaseOrderWithItems } = require('./edit/editWithItems');
const { updatePurchaseOrderHeaderOnly } = require('./edit/editHeaderOnly');

const registerPurchaseOrdersEditRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbGetAsync,
    getDistributorByIdAsync,
    getPurchaseOrderLifecycleStatus,
    isPoEditableLifecycle,
    computePurchasePaymentDueDate,
    logAdminAuditAsync,
    normalizeTransactionDate,
    PO_LIFECYCLE_REVISED,
    PO_LIFECYCLE_SENT,
  } = deps;

  app.put('/api/purchase-orders/:id', requireAdmin, async (req, res) => {
    try {
      const cur = await dbGetAsync('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Purchase order not found' });
      const currentPoStatus = getPurchaseOrderLifecycleStatus(cur);
      if (!isPoEditableLifecycle(currentPoStatus)) {
        return res.status(400).json({ error: 'Only prepared, sent, or revised purchase orders can be edited' });
      }
      const b = req.body || {};
      const items = Array.isArray(b.items) ? b.items : null;

      const updatedDistributorId = Number(b.distributor_id ?? cur.distributor_id ?? 0) || null;
      const updatedNotes = b.notes ?? cur.notes ?? '';
      const updatedExpectedDelivery = b.expected_delivery ?? cur.expected_delivery ?? null;
      const distributor = await getDistributorByIdAsync(updatedDistributorId);
      if (!distributor) return res.status(404).json({ error: 'Distributor not found' });
      const nextLifecycleStatus = currentPoStatus === PO_LIFECYCLE_SENT ? PO_LIFECYCLE_REVISED : currentPoStatus;
      const shouldIncrementRevision = currentPoStatus === PO_LIFECYCLE_SENT || currentPoStatus === PO_LIFECYCLE_REVISED;
      const plannedOrderDate = normalizeTransactionDate(
        b.planned_order_date || updatedExpectedDelivery || cur.planned_order_date || cur.expected_delivery || cur.created_at
      ) || new Date().toISOString().slice(0, 10);
      const inferredPaymentDueDate = computePurchasePaymentDueDate(distributor, plannedOrderDate, {
        payment_cycle_type: b.payment_cycle_type,
        payment_due_days: b.payment_due_days,
      });
      const strictDueDate = normalizeTransactionDate(
        b.strict_due_date
        ?? b.strict_payment_due_date
        ?? cur.strict_due_date
        ?? null
      );
      const strictDueNote = (b.strict_due_note !== undefined || b.strict_deadline_note !== undefined)
        ? (String(b.strict_due_note || b.strict_deadline_note || '').trim() || null)
        : (String(cur.strict_due_note || '').trim() || null);
      const paymentDueDate = strictDueDate || inferredPaymentDueDate;

      if (items) {
        await updatePurchaseOrderWithItems(deps, {
          req,
          cur,
          items,
          updatedDistributorId,
          updatedNotes,
          updatedExpectedDelivery,
          plannedOrderDate,
          paymentDueDate,
          strictDueDate,
          strictDueNote,
          currentPoStatus,
          nextLifecycleStatus,
          shouldIncrementRevision,
        });
      } else {
        await updatePurchaseOrderHeaderOnly(deps, {
          req,
          cur,
          updatedDistributorId,
          updatedNotes,
          updatedExpectedDelivery,
          plannedOrderDate,
          paymentDueDate,
          strictDueDate,
          strictDueNote,
          currentPoStatus,
          nextLifecycleStatus,
          shouldIncrementRevision,
        });
      }

      await logAdminAuditAsync(req, {
        action: 'purchase_order.update',
        entityType: 'purchase_order',
        entityId: req.params.id,
        details: {
          status: nextLifecycleStatus,
          has_items_payload: Array.isArray(req.body?.items),
        },
      });
      return res.json({
        success: true,
        po_status: nextLifecycleStatus,
        payment_due_date: paymentDueDate,
        strict_due_date: strictDueDate,
      });
    } catch (error) {
      if (error.status === 400) {
        return res.status(400).json({ error: error.message, details: error.details || undefined });
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

module.exports = { registerPurchaseOrdersEditRoutes };
