const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const addDaysToDateKey = (dateKey, days) => {
  if (!DATE_KEY_PATTERN.test(String(dateKey || '').trim())) return '';
  const [year, month, day] = dateKey.split('-').map((v) => Number(v));
  const baseMs = Date.UTC(year, month - 1, day);
  const safeDays = Math.max(0, Math.floor(Number(days || 0)));
  const next = new Date(baseMs + (safeDays * DAY_MS));
  return next.toISOString().slice(0, 10);
};

const persistBillDraft = async (deps, req, draft) => {
  const {
    dbGetAsync,
    dbRunAsync,
    dbTxAsync,
    normalizePaymentMethod,
    getCustomerCreditProfileAsync,
    logStockLedgerAsync,
    recalculateCreditBalancesForUser,
    rebuildCustomerPaymentIntelligence,
  } = deps;

  const {
    billNumber,
    billType,
    customer,
    customerName,
    customerEmail,
    customerPhone,
    customerAddress,
    itemFulfillmentRows,
    shouldApplySalesStock,
    salesQtyByProduct,
    subtotal,
    billDiscount,
    totalAmount,
    paidAmount,
    creditAmount,
    paymentStatus,
    normalizedOrderId,
    clientRequestId,
  } = draft;

  const createdBy = Number(req.authUser?.id || 0) || null;

  const billId = await dbTxAsync(async () => {
    const header = await dbRunAsync(
      `INSERT INTO bills (bill_number, customer_id, customer_name, customer_email, customer_phone, customer_address, subtotal, discount_amount, total_amount, paid_amount, credit_amount, payment_method, payment_status, bill_type, created_by, client_request_id, order_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billNumber,
        Number(customer.id || 0) || null,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        subtotal,
        billDiscount,
        totalAmount,
        paidAmount,
        creditAmount,
        normalizePaymentMethod(req.body?.payment_method),
        paymentStatus,
        billType,
        createdBy,
        clientRequestId,
        normalizedOrderId,
        req.body?.notes ? String(req.body.notes) : null,
      ]
    );
    const billId = header.lastInsertRowid;
    for (const it of itemFulfillmentRows) {
      await dbRunAsync(
        `INSERT INTO bill_items
         (bill_id, product_id, product_name, mrp, qty, requested_qty, available_now_qty, fulfilled_qty, pending_qty, stock_snapshot, unit, line_subtotal, offer_discount, manual_discount, offer_label, discount, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billId,
          it.product_id,
          it.product_name,
          it.mrp,
          it.qty,
          it.requested_qty,
          it.available_now_qty,
          it.fulfilled_qty,
          it.pending_qty,
          it.stock_snapshot,
          it.unit,
          Number(it.line_subtotal || it.amount || 0),
          Math.max(0, Number(it.offer_discount || 0)),
          Math.max(0, Number(it.manual_discount || 0)),
          String(it.offer_label || '').trim() || null,
          it.discount,
          it.amount,
        ]
      );
    }
    if (shouldApplySalesStock) {
      for (const [productId, neededQty] of salesQtyByProduct.entries()) {
        const before = Number((await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [productId]))?.stock || 0);
        const deductionQty = Math.max(0, Number(neededQty || 0));
        if (deductionQty <= 0) continue;
        await dbRunAsync(`UPDATE products SET stock = stock - ? WHERE id = ?`, [deductionQty, productId]);
        const after = Number((await dbGetAsync(`SELECT stock FROM products WHERE id = ?`, [productId]))?.stock || 0);
        await logStockLedgerAsync({
          productId,
          transactionType: 'out',
          quantityChange: -Number(deductionQty || 0),
          previousBalance: before,
          newBalance: after,
          referenceType: 'bill',
          referenceId: String(billId),
          userId: createdBy,
          userName: req.authUser?.name || null,
          notes: `Sales bill ${billNumber}`,
        });
      }
    }
    if (creditAmount > 0 && Number(customer.id || 0)) {
      const last = await dbGetAsync(
        `SELECT balance
         FROM credit_history
         WHERE user_id = ?
         ORDER BY transaction_ts DESC, created_at DESC, id DESC
         LIMIT 1`,
        [Number(customer.id)]
      );
      const currentBalance = Number(last?.balance || 0);
      const nextBalance = currentBalance + Number(creditAmount || 0);
      const creditTransactionTs = new Date().toISOString();
      const transactionDateKey = creditTransactionTs.slice(0, 10);
      const creditProfile = await getCustomerCreditProfileAsync(Number(customer.id));
      const creditTermsDays = Math.max(0, Math.floor(Number(creditProfile?.credit_terms_days || 0)));
      const dueDate = addDaysToDateKey(transactionDateKey, creditTermsDays) || transactionDateKey;
      await dbRunAsync(
        `INSERT INTO credit_history (
           user_id,
           type,
           amount,
           balance,
           description,
           reference,
           transaction_date,
           due_date,
           transaction_ts,
           created_by,
           client_request_id,
           source_type,
           source_id,
           source_label
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(customer.id),
          'given',
          Number(creditAmount || 0),
          nextBalance,
          `Bill credit | Paid: Rs ${Number(paidAmount || 0).toFixed(2)} | Credit: Rs ${Number(creditAmount || 0).toFixed(2)}`,
          billNumber,
          transactionDateKey,
          dueDate,
          creditTransactionTs,
          createdBy,
          clientRequestId ? `${clientRequestId}:credit` : null,
          'bill',
          String(billId),
          billNumber,
        ]
      );
      await recalculateCreditBalancesForUser(Number(customer.id));
      await rebuildCustomerPaymentIntelligence(Number(customer.id));
    }
    if (normalizedOrderId) {
      await dbRunAsync(
        `UPDATE orders
         SET payment_status = ?, credit_applied = ?
         WHERE id = ?`,
        [paymentStatus, creditAmount > 0 ? 1 : 0, normalizedOrderId]
      );
    }
    return billId;
  });

  return { billId, createdBy };
};

module.exports = { persistBillDraft };
