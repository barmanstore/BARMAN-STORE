const normalizeCreditType = (type) => {
  const raw = String(type || '')
    .trim()
    .toLowerCase();
  return raw === 'payment' ? 'payment' : 'given';
};

const normalizeCreditIssueStatus = (value, { fallback = 'open' } = {}) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'reviewed') return 'in_review';
  if (normalized === 'resolved') return 'corrected';
  if (
    normalized === 'open' ||
    normalized === 'in_review' ||
    normalized === 'corrected' ||
    normalized === 'rejected'
  ) {
    return normalized;
  }
  return fallback;
};

module.exports = { normalizeCreditType, normalizeCreditIssueStatus };
