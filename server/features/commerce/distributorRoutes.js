const registerDistributorRoutes = (deps) => {
  const {
    app,
    requireAdmin,
    dbAllAsync,
    dbGetAsync,
    dbRunAsync,
    getDistributorPaymentPlan,
    normalizeBooleanFlag,
    getDistributorLedgerRows,
    handleDistributorLedgerCreate,
  } = deps;

  app.get('/api/distributors', requireAdmin, async (_, res) => {
    try {
      return res.json(await dbAllAsync(`SELECT * FROM distributors ORDER BY name ASC`));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/distributors/:id', requireAdmin, async (req, res) => {
    try {
      const row = await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Distributor not found' });
      return res.json(row);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/distributors', requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Distributor name is required' });
      const paymentPlan = getDistributorPaymentPlan(b, {
        payment_cycle_type: b.payment_cycle_type,
        payment_due_days: b.payment_due_days,
      });
      const result = await dbRunAsync(
        `INSERT INTO distributors
         (name, salesman_name, contacts, address, products_supplied, order_day, delivery_day, visit_day, order_cutoff_time, preferred_whatsapp_time, payment_terms, payment_cycle_type, payment_due_days, credit_limit, inactive_reason, auto_suggest_items, auto_reminders_enabled, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(b.name).trim(),
          b.salesman_name || null,
          b.contacts || null,
          b.address || null,
          b.products_supplied || null,
          b.order_day || null,
          b.delivery_day || null,
          b.visit_day || b.order_day || null,
          b.order_cutoff_time || null,
          b.preferred_whatsapp_time || null,
          b.payment_terms || 'Net 30',
          paymentPlan.paymentCycleType,
          paymentPlan.paymentDueDays,
          b.credit_limit === undefined || b.credit_limit === null || b.credit_limit === '' ? null : Number(b.credit_limit || 0),
          b.inactive_reason || null,
          normalizeBooleanFlag(b.auto_suggest_items, true),
          normalizeBooleanFlag(b.auto_reminders_enabled, true),
          b.status || 'active',
        ]
      );
      return res.status(201).json(await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [result.lastInsertRowid]));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/distributors/:id', requireAdmin, async (req, res) => {
    try {
      const cur = await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]);
      if (!cur) return res.status(404).json({ error: 'Distributor not found' });
      const b = req.body || {};
      const paymentPlan = getDistributorPaymentPlan(cur, {
        payment_cycle_type: b.payment_cycle_type ?? cur.payment_cycle_type,
        payment_due_days: b.payment_due_days ?? cur.payment_due_days,
      });
      await dbRunAsync(
        `UPDATE distributors
         SET name=?, salesman_name=?, contacts=?, address=?, products_supplied=?, order_day=?, delivery_day=?, visit_day=?, order_cutoff_time=?, preferred_whatsapp_time=?, payment_terms=?, payment_cycle_type=?, payment_due_days=?, credit_limit=?, inactive_reason=?, auto_suggest_items=?, auto_reminders_enabled=?, status=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`,
        [
          b.name ?? cur.name,
          b.salesman_name ?? cur.salesman_name,
          b.contacts ?? cur.contacts,
          b.address ?? cur.address,
          b.products_supplied ?? cur.products_supplied,
          b.order_day ?? cur.order_day,
          b.delivery_day ?? cur.delivery_day,
          b.visit_day ?? cur.visit_day ?? cur.order_day,
          b.order_cutoff_time ?? cur.order_cutoff_time,
          b.preferred_whatsapp_time ?? cur.preferred_whatsapp_time,
          b.payment_terms ?? cur.payment_terms,
          paymentPlan.paymentCycleType,
          paymentPlan.paymentDueDays,
          b.credit_limit === undefined ? cur.credit_limit : (b.credit_limit === null || b.credit_limit === '' ? null : Number(b.credit_limit || 0)),
          b.inactive_reason ?? cur.inactive_reason,
          normalizeBooleanFlag(b.auto_suggest_items, cur.auto_suggest_items !== false),
          normalizeBooleanFlag(b.auto_reminders_enabled, cur.auto_reminders_enabled !== false),
          b.status ?? cur.status,
          req.params.id,
        ]
      );
      return res.json(await dbGetAsync(`SELECT * FROM distributors WHERE id = ?`, [req.params.id]));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/distributors/:id', requireAdmin, async (req, res) => {
    try {
      await dbRunAsync(`DELETE FROM distributors WHERE id = ?`, [req.params.id]);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/distributor-ledger', requireAdmin, async (req, res) => {
    try {
      return res.json(await getDistributorLedgerRows(req));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/distributors/ledger', requireAdmin, async (req, res) => {
    try {
      return res.json(await getDistributorLedgerRows(req));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/distributors/:id/ledger', requireAdmin, async (req, res) => {
    try {
      return res.json(await getDistributorLedgerRows(req, req.params.id));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/distributors/:id/credit-history', requireAdmin, async (req, res) => {
    try {
      return res.json(await getDistributorLedgerRows(req, req.params.id));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/distributor-ledger', requireAdmin, async (req, res) =>
    handleDistributorLedgerCreate(req, res)
  );
  app.post('/api/distributors/ledger', requireAdmin, async (req, res) =>
    handleDistributorLedgerCreate(req, res)
  );
  app.post('/api/distributors/:id/ledger', requireAdmin, async (req, res) =>
    handleDistributorLedgerCreate(req, res, req.params.id)
  );
  app.post('/api/distributors/:id/transactions', requireAdmin, async (req, res) =>
    handleDistributorLedgerCreate(req, res, req.params.id)
  );
  app.post('/api/distributors/:id/credit', requireAdmin, async (req, res) =>
    handleDistributorLedgerCreate(req, res, req.params.id)
  );
};

module.exports = { registerDistributorRoutes };
