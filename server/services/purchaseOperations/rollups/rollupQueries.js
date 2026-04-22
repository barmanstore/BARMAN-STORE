const createRollupQueries = ({
  dbAllAsync,
  normalizePoLifecycleStatus,
  PURCHASE_ACTION_STATUS_MAP,
} = {}) => {
  const buildRangeParams = ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const rangeParams = [normalizedStart, normalizedEnd];
    const distributorParams = distributorId ? [distributorId] : [];
    const params = distributorId ? [...rangeParams, ...distributorParams] : rangeParams;
    const distributorClause = distributorId ? 'AND distributor_id = ?' : '';
    return { params, distributorClause };
  };

  const fetchPoCreatedRows = ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const { params, distributorClause } = buildRangeParams({
      normalizedStart,
      normalizedEnd,
      distributorId,
    });
    return dbAllAsync(
      `SELECT date(created_at) AS action_date
       FROM purchase_orders
       WHERE date(created_at) >= date(?)
         AND date(created_at) <= date(?)
         ${distributorClause}`,
      params
    );
  };

  const fetchStatusRows = async ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const rangeParams = [normalizedStart, normalizedEnd];
    const distributorParams = distributorId ? [distributorId] : [];
    const params = distributorId ? [...rangeParams, ...distributorParams] : rangeParams;
    const distributorClause = distributorId ? 'AND po.distributor_id = ?' : '';
    const rows = await dbAllAsync(
      `SELECT date(posh.created_at) AS action_date, LOWER(posh.to_status) AS to_status
       FROM purchase_order_status_history posh
       LEFT JOIN purchase_orders po ON po.id = posh.purchase_order_id
       WHERE date(posh.created_at) >= date(?)
         AND date(posh.created_at) <= date(?)
         ${distributorClause}`,
      params
    );
    return rows.map((row) => {
      const statusKey = normalizePoLifecycleStatus(row.to_status || '');
      const actionKey = PURCHASE_ACTION_STATUS_MAP.get(statusKey) || null;
      return { action_date: row.action_date, action_key: actionKey };
    });
  };

  const fetchPaymentRows = ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const { params, distributorClause } = buildRangeParams({
      normalizedStart,
      normalizedEnd,
      distributorId,
    });
    return dbAllAsync(
      `SELECT date(COALESCE(transaction_date, created_at)) AS action_date
       FROM purchase_order_payments
       WHERE date(COALESCE(transaction_date, created_at)) >= date(?)
         AND date(COALESCE(transaction_date, created_at)) <= date(?)
         ${distributorClause}`,
      params
    );
  };

  const fetchDeliveryRows = ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const { params, distributorClause } = buildRangeParams({
      normalizedStart,
      normalizedEnd,
      distributorId,
    });
    return dbAllAsync(
      `SELECT date(received_at) AS action_date
       FROM purchase_orders
       WHERE received_at IS NOT NULL
         AND date(received_at) >= date(?)
         AND date(received_at) <= date(?)
         ${distributorClause}`,
      params
    );
  };

  const fetchReturnRows = ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const { params, distributorClause } = buildRangeParams({
      normalizedStart,
      normalizedEnd,
      distributorId,
    });
    return dbAllAsync(
      `SELECT date(created_at) AS action_date
       FROM purchase_returns
       WHERE date(created_at) >= date(?)
         AND date(created_at) <= date(?)
         ${distributorClause}`,
      params
    );
  };

  const fetchLedgerRows = ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const { params, distributorClause } = buildRangeParams({
      normalizedStart,
      normalizedEnd,
      distributorId,
    });
    return dbAllAsync(
      `SELECT date(COALESCE(transaction_date, created_at)) AS action_date
       FROM distributor_ledger
       WHERE date(COALESCE(transaction_date, created_at)) >= date(?)
         AND date(COALESCE(transaction_date, created_at)) <= date(?)
         AND (
           source IS NULL
           OR TRIM(source) = ''
           OR LOWER(source) NOT IN ('purchase_order', 'po_payment', 'po_correction')
         )
         ${distributorClause}`,
      params
    );
  };

  const fetchReminderRows = ({ normalizedStart, normalizedEnd, distributorId } = {}) => {
    const { params, distributorClause } = buildRangeParams({
      normalizedStart,
      normalizedEnd,
      distributorId,
    });
    return dbAllAsync(
      `SELECT date(COALESCE(sent_at, created_at)) AS action_date
       FROM distributor_purchase_reminders
       WHERE (sent_at IS NOT NULL OR LOWER(COALESCE(status, '')) = 'sent')
         AND date(COALESCE(sent_at, created_at)) >= date(?)
         AND date(COALESCE(sent_at, created_at)) <= date(?)
         ${distributorClause}`,
      params
    );
  };

  return {
    fetchPoCreatedRows,
    fetchStatusRows,
    fetchPaymentRows,
    fetchDeliveryRows,
    fetchReturnRows,
    fetchLedgerRows,
    fetchReminderRows,
  };
};

module.exports = { createRollupQueries };
