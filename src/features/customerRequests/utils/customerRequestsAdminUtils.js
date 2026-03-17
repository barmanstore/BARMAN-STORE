export const recommendationStatuses = ['open', 'reviewed', 'fulfilled', 'rejected'];
export const issueStatuses = ['open', 'in_review', 'corrected', 'rejected'];
export const phoneStatuses = ['open', 'pending_validation', 'approved', 'rejected', 'all'];

export const formatMergeImpact = (impact) => {
  if (!impact || typeof impact !== 'object') return '';
  const total = Number(impact.total_records || 0);
  const parts = [
    `total ${total}`,
    `credit ${Number(impact.credit_history || 0)}`,
    `issues ${Number(impact.credit_entry_issues || 0)}`,
    `bills ${Number(impact.bills || 0)}`,
    `orders ${Number(impact.orders || 0)}`,
    `reco ${Number(impact.product_recommendations || 0)}`
  ];
  return parts.join(' | ');
};
