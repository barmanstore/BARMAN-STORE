const createSummaryDataQueries = ({ dbAllAsync } = {}) => {
  const fetchProducts = () =>
    dbAllAsync(
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

  const fetchSuppliers = (distributorIdFilter) => {
    const supplierWhereSql = distributorIdFilter ? ` WHERE distributor_id = ?` : '';
    return dbAllAsync(
      `SELECT *
       FROM suppliers${supplierWhereSql}
       ORDER BY distributor_id ASC, is_primary DESC, name ASC`,
      distributorIdFilter ? [distributorIdFilter] : []
    );
  };

  const fetchOrders = (distributorIdFilter) => {
    const orderWhereSql = distributorIdFilter ? ` WHERE po.distributor_id = ?` : '';
    return dbAllAsync(
      `SELECT po.*, d.name AS distributor_name, d.payment_terms, d.payment_cycle_type, d.payment_due_days, d.auto_reminders_enabled,
              s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN distributors d ON d.id = po.distributor_id
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       ${orderWhereSql}
       ORDER BY po.created_at DESC`,
      distributorIdFilter ? [distributorIdFilter] : []
    );
  };

  const fetchPayments = (distributorIdFilter) =>
    dbAllAsync(
      `SELECT pop.*, po.po_number, po.payment_due_date, po.bill_number, po.invoice_number,
            po.supplier_id, po.planned_order_date, po.po_status,
            d.name AS distributor_name, s.name AS supplier_name
     FROM purchase_order_payments pop
     LEFT JOIN purchase_orders po ON po.id = pop.purchase_order_id
     LEFT JOIN distributors d ON d.id = pop.distributor_id
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     ${distributorIdFilter ? `WHERE pop.distributor_id = ?` : ''}
     ORDER BY COALESCE(pop.transaction_date, pop.created_at) DESC, pop.id DESC`,
      distributorIdFilter ? [distributorIdFilter] : []
    );

  const fetchItems = (distributorIdFilter) =>
    dbAllAsync(
      `SELECT poi.order_id, poi.product_id, poi.product_name, poi.quantity, poi.uom, poi.rate, poi.unit_price, poi.gst_rate, poi.discount_type, poi.discount_value
     FROM purchase_order_items poi
     INNER JOIN purchase_orders po ON po.id = poi.order_id
     ${distributorIdFilter ? `WHERE po.distributor_id = ?` : ''}`,
      distributorIdFilter ? [distributorIdFilter] : []
    );

  const fetchLedgerBalances = (distributorIdFilter) =>
    dbAllAsync(
      `SELECT distributor_id, balance, transaction_date, created_at, id
     FROM distributor_ledger
     ${distributorIdFilter ? `WHERE distributor_id = ?` : ''}
     ORDER BY distributor_id ASC, COALESCE(transaction_date, created_at) DESC, id DESC`,
      distributorIdFilter ? [distributorIdFilter] : []
    );

  const fetchSupplierVisits = ({ distributorIdFilter, startDate, endDate } = {}) => {
    const params = [];
    const whereParts = [];
    if (startDate) {
      whereParts.push('sv.visit_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      whereParts.push('sv.visit_date <= ?');
      params.push(endDate);
    }
    if (distributorIdFilter) {
      whereParts.push('s.distributor_id = ?');
      params.push(distributorIdFilter);
    }
    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    return dbAllAsync(
      `SELECT sv.*, s.name AS supplier_name, s.distributor_id, d.name AS distributor_name
       FROM supplier_visits sv
       INNER JOIN suppliers s ON s.id = sv.supplier_id
       LEFT JOIN distributors d ON d.id = s.distributor_id
       ${whereSql}
       ORDER BY sv.visit_date ASC, s.name ASC`,
      params
    );
  };

  return {
    fetchProducts,
    fetchDistributors,
    fetchSuppliers,
    fetchOrders,
    fetchPayments,
    fetchItems,
    fetchLedgerBalances,
    fetchSupplierVisits,
  };
};

module.exports = { createSummaryDataQueries };
