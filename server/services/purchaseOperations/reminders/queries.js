const createPurchaseOperationsReminderQueries = (deps) => {
  const { dbAllAsync, normalizeTransactionDate, addDaysToDateKey } = deps;

  const loadPurchaseOperationReminderDataAsync = async ({
    date = null,
    distributorId = null,
  } = {}) => {
    const todayKey =
      normalizeTransactionDate(date || new Date().toISOString()) ||
      new Date().toISOString().slice(0, 10);
    const tomorrowKey = addDaysToDateKey(todayKey, 1) || todayKey;
    const normalizedDistributorId = Number(distributorId || 0) || null;
    const distributorWhereSql = normalizedDistributorId ? ' WHERE id = ?' : '';
    const orderWhereSql = normalizedDistributorId ? ' WHERE po.distributor_id = ?' : '';
    const distributorParams = normalizedDistributorId ? [normalizedDistributorId] : [];
    const orderParams = normalizedDistributorId ? [normalizedDistributorId] : [];
    const distributors = await dbAllAsync(
      `SELECT *
       FROM distributors${distributorWhereSql}
       ORDER BY name ASC`,
      distributorParams
    );
    const suppliers = await dbAllAsync(
      `SELECT *
       FROM suppliers${normalizedDistributorId ? ' WHERE distributor_id = ?' : ''}
       ORDER BY distributor_id ASC, is_primary DESC, name ASC`,
      distributorParams
    );
    const orders = await dbAllAsync(
      `SELECT po.*, d.name AS distributor_name, d.payment_terms, d.payment_cycle_type, d.payment_due_days, d.auto_reminders_enabled
       FROM purchase_orders po
       LEFT JOIN distributors d ON d.id = po.distributor_id
       ${orderWhereSql}
       ORDER BY po.created_at DESC`,
      orderParams
    );
    const items = await dbAllAsync(
      `SELECT poi.order_id, poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, poi.gst_rate, poi.discount_type, poi.discount_value
       FROM purchase_order_items poi
       INNER JOIN purchase_orders po ON po.id = poi.order_id
       ${normalizedDistributorId ? 'WHERE po.distributor_id = ?' : ''}`,
      orderParams
    );

    return {
      todayKey,
      tomorrowKey,
      distributorId: normalizedDistributorId,
      distributors,
      suppliers,
      orders,
      items,
    };
  };

  return { loadPurchaseOperationReminderDataAsync };
};

module.exports = { createPurchaseOperationsReminderQueries };
