const registerBillingAdminRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizeEmail,
    normalizePhone,
    normalizeOrderStatus,
    normalizePaymentMethod,
    normalizeProductRecord,
    ORDER_STATUS_ORDERED,
    ORDER_STATUS_RECEIVED,
    resolveClientRequestId,
    isUniqueViolationError,
    generateBillNumber,
    logStockLedgerAsync,
    logAdminAuditAsync,
    createAppNotification,
    normalizeUomToken,
    UNIT_FAMILY_BASE_BY_UNIT,
    UNIT_FAMILY_MULTIPLIERS,
    getUomFamily,
    getAllowedUnitsFromBaseUnit,
    convertQtyBetweenFamilyUnits,
    normalizeUomType,
    getProductUomProfile,
    getAllowedBillingUnits,
    toStockUnitQty,
    fromStockUnitQty,
    roundQty,
    toPricingQty,
  } = deps;

app.get('/api/bills', requireAdmin, async (_, res) => {
  try {
    return res.json(await dbAllAsync(`SELECT * FROM bills ORDER BY created_at DESC`));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const bill = await dbGetAsync(`SELECT * FROM bills WHERE id = ? OR bill_number = ?`, [id, id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = await dbAllAsync(`SELECT * FROM bill_items WHERE bill_id = ?`, [bill.id]);
    return res.json({ ...bill, items });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/bills/:id/payment', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM bills WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Bill not found' });
    const nextPaymentStatus = String(req.body?.payment_status || cur.payment_status || '').trim().toLowerCase() || 'pending';
    const nextPaymentMethod = req.body?.payment_method || cur.payment_method;
    await dbRunAsync(`UPDATE bills SET payment_status = ?, payment_method = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?`, [
      nextPaymentStatus,
      nextPaymentMethod,
      req.params.id,
    ]);
    const linkedOrderId = Number(cur.order_id || 0);
    if (linkedOrderId) {
      await dbRunAsync(
        `UPDATE orders
         SET payment_status = ?, credit_applied = ?
         WHERE id = ?`,
        [nextPaymentStatus, nextPaymentStatus === 'paid' ? 0 : Number(cur.credit_amount || 0) > 0 ? 1 : 0, linkedOrderId]
      );
    }
    await logAdminAuditAsync(req, {
      action: 'bill.payment_update',
      entityType: 'bill',
      entityId: req.params.id,
      details: {
        payment_status: nextPaymentStatus,
        payment_method: nextPaymentMethod,
        linked_order_id: linkedOrderId || null,
      },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/stats/summary', requireAdmin, async (_, res) => {
  try {
    const totalBills = (await dbGetAsync(`SELECT COUNT(*) as count FROM bills`))?.count || 0;
    const totalSales = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'sales'`))?.total || 0;
    const totalPurchase = (await dbGetAsync(`SELECT COALESCE(SUM(total_amount),0) as total FROM bills WHERE bill_type = 'purchase'`))?.total || 0;
    return res.json({ totalBills, totalSales, totalPurchase });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
};

module.exports = { registerBillingAdminRoutes };

