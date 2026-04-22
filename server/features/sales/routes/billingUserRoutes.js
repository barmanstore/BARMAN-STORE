const registerBillingUserRoutes = (deps) => {
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

  app.get('/api/users/:userId/bills', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await dbAllAsync(
        `SELECT *
       FROM bills
       WHERE customer_id = ?
       ORDER BY created_at DESC`,
        [requestUserId]
      );
      return res.json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/users/:userId/bills/:identifier', requireAuth, async (req, res) => {
    try {
      const requestUserId = Number(req.params.userId);
      if (!requestUserId) return res.status(400).json({ error: 'Invalid user id' });
      const isAdmin = req.authUser?.role === 'admin';
      if (!isAdmin && Number(req.authUser?.id) !== requestUserId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const identifier = String(req.params.identifier || '').trim();
      const bill = await dbGetAsync(
        `SELECT *
       FROM bills
       WHERE customer_id = ?
         AND (id = ? OR bill_number = ?)
       LIMIT 1`,
        [requestUserId, identifier, identifier]
      );
      if (!bill) return res.status(404).json({ error: 'Bill not found' });
      const items = await dbAllAsync(`SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id ASC`, [
        bill.id,
      ]);
      return res.json({ ...bill, items });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
};

module.exports = { registerBillingUserRoutes };
