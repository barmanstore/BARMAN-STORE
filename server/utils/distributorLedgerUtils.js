const createDistributorLedgerUtils = (deps = {}) => {
  const { dbAllAsync, dbGetAsync, dbRunAsync, SQL_CAST_TO_INT } = deps;

  const createHttpError = (status, message) => Object.assign(new Error(message), { status });

  const normalizeDistributorLedgerType = (type) => {
    const raw = String(type || '')
      .trim()
      .toLowerCase();
    if (raw === 'payment' || raw === 'paid') return 'payment';
    if (raw === 'credit' || raw === 'given' || raw === 'due') return 'credit';
    return 'credit';
  };

  const getDistributorLedgerRows = async (req, distributorIdOverride = null) => {
    let sql = `
      SELECT dl.*, d.name as distributor_name,
             pop.purchase_order_id as payment_purchase_order_id,
             po.id as linked_po_id,
             po.po_status as linked_po_status,
             po.payment_status as linked_po_payment_status,
             po.bill_number as po_bill_number,
             po.invoice_number as po_invoice_number,
             COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
      FROM distributor_ledger dl
      LEFT JOIN distributors d ON d.id = dl.distributor_id
      LEFT JOIN purchase_order_payments pop
        ON dl.source = 'po_payment'
       AND ${SQL_CAST_TO_INT} = pop.id
      LEFT JOIN purchase_orders po
        ON (
          dl.source IN ('purchase_order', 'po_correction')
          AND ${SQL_CAST_TO_INT} = po.id
        )
        OR (
          dl.source = 'po_payment'
          AND pop.purchase_order_id = po.id
        )
      WHERE 1=1
    `;
    const params = [];
    const distributorId = distributorIdOverride ?? req.query.distributor_id;
    if (distributorId) {
      sql += ` AND dl.distributor_id = ?`;
      params.push(distributorId);
    }
    if (req.query.type) {
      sql += ` AND LOWER(dl.type) = LOWER(?)`;
      params.push(req.query.type);
    }
    if (req.query.start_date) {
      sql += ` AND date(COALESCE(dl.transaction_date, dl.created_at)) >= date(?)`;
      params.push(req.query.start_date);
    }
    if (req.query.end_date) {
      sql += ` AND date(COALESCE(dl.transaction_date, dl.created_at)) <= date(?)`;
      params.push(req.query.end_date);
    }
    sql += ` ORDER BY COALESCE(dl.transaction_date, dl.created_at) DESC, dl.id DESC`;
    if (req.query.limit) {
      const limit = Math.max(1, Number(req.query.limit) || 100);
      sql += ` LIMIT ${limit}`;
    }
    return await dbAllAsync(sql, params);
  };

  const createDistributorLedgerEntry = async (distributorIdRaw, body = {}) => {
    const distributorId = Number(distributorIdRaw || body.distributor_id || body.user_id);
    if (!distributorId) throw createHttpError(400, 'distributor_id is required');

    const distributor = await dbGetAsync(`SELECT id FROM distributors WHERE id = ?`, [
      distributorId,
    ]);
    if (!distributor) throw createHttpError(404, 'Distributor not found');

    const rawAmount = Math.abs(Number(body.amount || 0));
    if (!rawAmount) throw createHttpError(400, 'amount must be greater than 0');

    const type = normalizeDistributorLedgerType(body.type || body.transaction_type);
    const signedAmount = type === 'payment' ? -rawAmount : rawAmount;
    const last = await dbGetAsync(
      `SELECT balance FROM distributor_ledger WHERE distributor_id = ? ORDER BY COALESCE(transaction_date, created_at) DESC, id DESC LIMIT 1`,
      [distributorId]
    );
    const previousBalance = Number(last?.balance || 0);
    const nextBalance = previousBalance + signedAmount;
    const transactionDateRaw = body.transaction_date || body.transactionDate || null;
    const transactionDate = transactionDateRaw ? String(transactionDateRaw).slice(0, 10) : null;
    const paymentMode = body.payment_mode || body.mode || null;
    const billNumberRaw = body.bill_number ?? body.billNo ?? body.invoice_number;
    const billNumber =
      billNumberRaw === undefined || billNumberRaw === null
        ? null
        : String(billNumberRaw).trim() || null;
    const sourceIdRaw = body.source_id;
    const sourceIdText =
      sourceIdRaw === undefined || sourceIdRaw === null ? '' : String(sourceIdRaw).trim();
    const sourceId = sourceIdText
      ? /^[0-9]+(?:\.0+)?$/.test(sourceIdText)
        ? String(parseInt(sourceIdText, 10))
        : sourceIdText
      : null;

    const result = await dbRunAsync(
      `INSERT INTO distributor_ledger
      (distributor_id, type, amount, balance, payment_mode, reference, bill_number, description, transaction_date, source, source_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        distributorId,
        type,
        rawAmount,
        nextBalance,
        paymentMode,
        body.reference || null,
        billNumber,
        body.description || null,
        transactionDate,
        body.source || null,
        sourceId,
        body.created_by || null,
      ]
    );

    return await dbGetAsync(
      `SELECT dl.*, d.name as distributor_name,
              pop.purchase_order_id as payment_purchase_order_id,
              po.id as linked_po_id,
              po.po_status as linked_po_status,
              po.payment_status as linked_po_payment_status,
              po.bill_number as po_bill_number,
              po.invoice_number as po_invoice_number,
              COALESCE(dl.bill_number, po.bill_number, po.invoice_number) as linked_bill_number
       FROM distributor_ledger dl
       LEFT JOIN distributors d ON d.id = dl.distributor_id
       LEFT JOIN purchase_order_payments pop
         ON dl.source = 'po_payment'
        AND ${SQL_CAST_TO_INT} = pop.id
       LEFT JOIN purchase_orders po
         ON (
           dl.source IN ('purchase_order', 'po_correction')
           AND ${SQL_CAST_TO_INT} = po.id
         )
         OR (
           dl.source = 'po_payment'
           AND pop.purchase_order_id = po.id
         )
       WHERE dl.id = ?`,
      [result.lastInsertRowid]
    );
  };

  const handleDistributorLedgerCreate = async (req, res, distributorId = null) => {
    try {
      const row = await createDistributorLedgerEntry(distributorId, req.body || {});
      return res.status(201).json(row);
    } catch (error) {
      const status = Number(error?.status || 0) || 500;
      const message = String(error?.message || 'Failed to create distributor ledger entry');
      return res.status(status).json({ error: message });
    }
  };

  return {
    getDistributorLedgerRows,
    createDistributorLedgerEntry,
    handleDistributorLedgerCreate,
  };
};

module.exports = { createDistributorLedgerUtils };
