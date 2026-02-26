const DAY_MS = 24 * 60 * 60 * 1000;

const getStartOfMonthTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 0;
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
};

const getRangeStartTimestamp = (rangeFilter, nowTimestamp) => {
  if (rangeFilter === '7d') return nowTimestamp - (7 * DAY_MS);
  if (rangeFilter === '30d') return nowTimestamp - (30 * DAY_MS);
  if (rangeFilter === 'this_month') return getStartOfMonthTimestamp(nowTimestamp);
  return null;
};

export const getBalanceSummary = (rawBalance) => {
  const balance = Number(rawBalance || 0);
  if (balance > 0) {
    return {
      headline: 'You will get',
      directionLine: 'Customer will give you this amount',
      toneClass: 'positive',
    };
  }
  if (balance < 0) {
    return {
      headline: 'You will give',
      directionLine: 'You owe customer this amount',
      toneClass: 'negative',
    };
  }
  return {
    headline: 'All settled',
    directionLine: 'No due amount right now',
    toneClass: 'neutral',
  };
};

export const getLastTransactionFromHistory = (transactions, getTimestamp) => {
  if (!Array.isArray(transactions) || transactions.length === 0 || typeof getTimestamp !== 'function') {
    return null;
  }
  return transactions.reduce((latest, transaction) => {
    const latestTs = latest ? Number(getTimestamp(latest)) : -Infinity;
    const currentTs = Number(getTimestamp(transaction));
    if (!Number.isFinite(currentTs)) return latest;
    if (!latest || currentTs > latestTs) return transaction;
    return latest;
  }, null);
};

export const applyCreditQuickFilters = (transactions, {
  typeFilter = 'all',
  rangeFilter = 'all',
  nowTimestamp = Date.now(),
  getTimestamp,
} = {}) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];
  const normalizedTypeFilter = String(typeFilter || 'all').toLowerCase();
  const hasTypeFilter = normalizedTypeFilter === 'given' || normalizedTypeFilter === 'payment';
  const rangeStart = getRangeStartTimestamp(String(rangeFilter || 'all').toLowerCase(), Number(nowTimestamp));
  const timestampGetter = typeof getTimestamp === 'function'
    ? getTimestamp
    : (transaction) => new Date(transaction?.created_at || '').getTime();

  return transactions.filter((transaction) => {
    const txType = String(transaction?.type || '').toLowerCase();
    if (hasTypeFilter && txType !== normalizedTypeFilter) return false;
    if (rangeStart === null) return true;
    const txTimestamp = Number(timestampGetter(transaction));
    if (!Number.isFinite(txTimestamp)) return false;
    return txTimestamp >= rangeStart && txTimestamp <= nowTimestamp;
  });
};

export const getRecentActivityHint = (lastTimestamp, {
  idleDays = 30,
  nowTimestamp = Date.now(),
} = {}) => {
  const lastTxTimestamp = Number(lastTimestamp);
  if (!Number.isFinite(lastTxTimestamp) || lastTxTimestamp <= 0) return '';
  const days = Number(idleDays || 30);
  if (!Number.isFinite(days) || days <= 0) return '';
  const elapsed = Number(nowTimestamp) - lastTxTimestamp;
  if (elapsed < days * DAY_MS) return '';
  return `No activity in last ${Math.floor(days)} days. Consider sending a reminder.`;
};

export const truncateCreditDescription = (value, maxLength = 56) => {
  const text = String(value || '').trim();
  const limit = Number(maxLength);
  if (!text) return '';
  if (!Number.isFinite(limit) || limit < 4) return text;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).trimEnd()}...`;
};

