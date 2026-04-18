const createPhoneMergeImpactSummary = (deps = {}) => {
  const { dbGetAsync } = deps;

  const getPhoneMergeImpactSummary = async (sourceUserId) => {
    const id = Number(sourceUserId || 0);
    if (!id) return null;
    const [creditHistoryRow, creditIssueRow, billsRow, ordersRow, recommendationsRow] =
      await Promise.all([
        dbGetAsync('SELECT COUNT(*) AS count FROM credit_history WHERE user_id = ?', [id]),
        dbGetAsync('SELECT COUNT(*) AS count FROM credit_entry_issues WHERE user_id = ?', [id]),
        dbGetAsync('SELECT COUNT(*) AS count FROM bills WHERE customer_id = ?', [id]),
        dbGetAsync('SELECT COUNT(*) AS count FROM orders WHERE user_id = ?', [id]),
        dbGetAsync('SELECT COUNT(*) AS count FROM product_recommendations WHERE user_id = ?', [id]),
      ]);
    const summary = {
      credit_history: Number(creditHistoryRow?.count || 0),
      credit_entry_issues: Number(creditIssueRow?.count || 0),
      bills: Number(billsRow?.count || 0),
      orders: Number(ordersRow?.count || 0),
      product_recommendations: Number(recommendationsRow?.count || 0),
    };
    return {
      source_user_id: id,
      ...summary,
      total_records: Object.values(summary).reduce((total, value) => total + Number(value || 0), 0),
    };
  };

  return { getPhoneMergeImpactSummary };
};

module.exports = { createPhoneMergeImpactSummary };
