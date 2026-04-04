const createSummaryDataQueries = ({ dbAllAsync } = {}) => {
  const fetchProducts = () => dbAllAsync(
    `SELECT id, name, category, brand, uom, is_active
     FROM products
     ORDER BY name ASC`
  );

  const fetchDistributors = (distributorIdFilter) => {
    const distributorWhereSql = distributorIdFilter ? ` WHERE id = ?` : '';
    return dbAllAsync(
      `SELECT * FROM distributors${distributorWhereSql} ORDER BY name ASC`,
      distributorIdFilter ? [distributorIdFilter] : []
    );
  };

  const fetchOrders = (distributorIdFilter) => {
    const orderWhereSql = distributorIdFilter ? ` WHERE po.distributor_id = ?` : '';
    return dbAllAsync(
      `SELECT po.*, d.name AS distributor_name, d.order_day, d.delivery_day, d.visit_day, d.payment_terms, d.payment_cycle_type, d.payment_due_days, d.auto_reminders_enabled
       FROM purchase_orders po
       LEFT JOIN distributors d ON d.id = po.distributor_id
       ${orderWhereSql}
       ORDER BY po.created_at DESC`,
      distributorIdFilter ? [distributorIdFilter] : []
    );
  };

  const fetchPayments = (distributorIdFilter) => dbAllAsync(
    `SELECT pop.*, po.po_number, po.payment_due_date, po.bill_number, po.invoice_number, d.name AS distributor_name
     FROM purchase_order_payments pop
     LEFT JOIN purchase_orders po ON po.id = pop.purchase_order_id
     LEFT JOIN distributors d ON d.id = pop.distributor_id
     ${distributorIdFilter ? `WHERE pop.distributor_id = ?` : ''}
     ORDER BY COALESCE(pop.transaction_date, pop.created_at) DESC, pop.id DESC`,
    distributorIdFilter ? [distributorIdFilter] : []
  );

  const fetchItems = (distributorIdFilter) => dbAllAsync(
    `SELECT poi.order_id, poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, poi.gst_rate, poi.discount_type, poi.discount_value
     FROM purchase_order_items poi
     INNER JOIN purchase_orders po ON po.id = poi.order_id
     ${distributorIdFilter ? `WHERE po.distributor_id = ?` : ''}`,
    distributorIdFilter ? [distributorIdFilter] : []
  );

  const fetchLedgerBalances = (distributorIdFilter) => dbAllAsync(
    `SELECT distributor_id, balance, transaction_date, created_at, id
     FROM distributor_ledger
     ${distributorIdFilter ? `WHERE distributor_id = ?` : ''}
     ORDER BY distributor_id ASC, COALESCE(transaction_date, created_at) DESC, id DESC`,
    distributorIdFilter ? [distributorIdFilter] : []
  );

  return {
    fetchProducts,
    fetchDistributors,
    fetchOrders,
    fetchPayments,
    fetchItems,
    fetchLedgerBalances,
  };
};

module.exports = { createSummaryDataQueries };
