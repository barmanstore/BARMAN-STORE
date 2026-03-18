const registerBillingAdminRoutes = (deps) => {
  const {
    app,
    requireAuth,
    requireAdmin,
    requireCapability,
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

app.get('/api/bills', requireCapability('view_backoffice', 'Backoffice access required'), async (req, res) => {
  try {
    const query = String(req.query?.q || '').trim();
    const billType = String(req.query?.bill_type || '').trim().toLowerCase();
    const dateKey = String(req.query?.date || '').trim();
    const wantsPaginated = ['1', 'true', 'yes'].includes(String(req.query?.paginated || '').trim().toLowerCase());
    const page = Math.max(1, Number.parseInt(req.query?.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query?.limit, 10) || 50));
    const offset = (page - 1) * limit;
    const clauses = [];
    const params = [];

    if (query) {
      clauses.push(`(
        bill_number LIKE ?
        OR customer_name LIKE ?
        OR customer_email LIKE ?
        OR customer_phone LIKE ?
        OR CAST(id AS TEXT) LIKE ?
      )`);
      params.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
    if (billType) {
      clauses.push(`LOWER(COALESCE(bill_type, 'sales')) = ?`);
      params.push(billType);
    }
    if (dateKey) {
      clauses.push(`date(created_at, 'localtime') = date(?)`);
      params.push(dateKey);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const baseQuery = `SELECT * FROM bills ${whereClause} ORDER BY created_at DESC`;

    if (!wantsPaginated) {
      return res.json(await dbAllAsync(baseQuery, params));
    }

    const [items, totalRow] = await Promise.all([
      dbAllAsync(`${baseQuery} LIMIT ? OFFSET ?`, [...params, limit, offset]),
      dbGetAsync(`SELECT COUNT(*) AS total FROM bills ${whereClause}`, params),
    ]);

    return res.json({
      items,
      page,
      limit,
      total: Number(totalRow?.total || 0),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bills/:id', requireCapability('view_backoffice', 'Backoffice access required'), async (req, res) => {
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

app.delete('/api/bills/:id', requireCapability('delete_bills', 'Bill deletion access required'), async (req, res) => {
  try {
    const existing = await dbGetAsync(`SELECT * FROM bills WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Bill not found' });
    await dbTxAsync(async () => {
      await dbRunAsync(`DELETE FROM bill_items WHERE bill_id = ?`, [req.params.id]);
      await dbRunAsync(`DELETE FROM bills WHERE id = ?`, [req.params.id]);
    });
    await logAdminAuditAsync(req, {
      action: 'bill.delete',
      entityType: 'bill',
      entityId: req.params.id,
      details: {
        bill_number: existing.bill_number || null,
        total_amount: Number(existing.total_amount || 0),
        order_id: Number(existing.order_id || 0) || null,
      },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/bills/:id/payment', requireAdmin, async (req, res) => {
  try {
    const cur = await dbGetAsync(`SELECT * FROM bills WHERE id = ?`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Bill not found' });
    const nextPaymentStatus = String(req.body?.payment_status || cur.payment_status || '').trim().toLowerCase() || 'pending';
    const nextPaymentMethod = normalizePaymentMethod(req.body?.payment_method || cur.payment_method);
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

app.get('/api/bills/stats/summary', requireCapability('view_backoffice', 'Backoffice access required'), async (_, res) => {
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

