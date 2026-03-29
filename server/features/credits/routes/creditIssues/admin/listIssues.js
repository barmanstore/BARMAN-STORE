const listCreditIssues = async ({
  dbAllAsync,
  normalizeCreditIssueStatus,
  requestedStatus,
} = {}) => {
  const normalizedStatus = requestedStatus
    ? normalizeCreditIssueStatus(requestedStatus, { fallback: '' })
    : '';
  if (requestedStatus && !normalizedStatus) {
    const error = new Error('Invalid status filter');
    error.status = 400;
    throw error;
  }
  const rows = await dbAllAsync(
    `SELECT cei.*,
            u.name as user_name,
            u.email as user_email,
            ch.amount as credit_amount,
            ch.balance as credit_balance,
            ch.reference as credit_reference,
            corr.amount as correction_amount,
            corr.type as correction_type,
            corr.reference as correction_reference
     FROM credit_entry_issues cei
     LEFT JOIN users u ON u.id = cei.user_id
     LEFT JOIN credit_history ch ON ch.id = cei.credit_entry_id
     LEFT JOIN credit_history corr ON corr.id = cei.correction_entry_id
     ${normalizedStatus ? 'WHERE cei.status = ?' : ''}
     ORDER BY cei.created_at DESC`,
    normalizedStatus ? [normalizedStatus] : []
  );
  return rows;
};

module.exports = { listCreditIssues };
