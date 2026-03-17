const createCreditBalanceUtils = ({
  dbGetAsync,
  dbAllAsync,
  dbRunAsync,
  dbTxAsync,
  normalizeCreditType,
} = {}) => {
  const getLatestCreditEntryAsync = (userId) => dbGetAsync(
    `SELECT *
     FROM credit_history
     WHERE user_id = ?
     ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) DESC, created_at DESC, id DESC
     LIMIT 1`,
    [userId]
  );

  const recalculateCreditBalancesForUser = async (userId) => dbTxAsync(async () => {
    const rows = await dbAllAsync(
      `SELECT id, type, amount
       FROM credit_history
       WHERE user_id = ?
       ORDER BY COALESCE(transaction_ts, transaction_date::timestamp, created_at) ASC, created_at ASC, id ASC`,
      [userId]
    );

    let runningBalance = 0;
    for (const row of rows) {
      const normalizedType = normalizeCreditType(row.type);
      const amount = Math.abs(Number(row.amount || 0));
      runningBalance = normalizedType === 'payment'
        ? (runningBalance - amount)
        : (runningBalance + amount);
      await dbRunAsync(`UPDATE credit_history SET balance = ? WHERE id = ?`, [runningBalance, row.id]);
    }

    return runningBalance;
  });

  return {
    getLatestCreditEntryAsync,
    recalculateCreditBalancesForUser,
  };
};

module.exports = { createCreditBalanceUtils };
