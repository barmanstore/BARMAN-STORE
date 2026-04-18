const DAY_MS = 24 * 60 * 60 * 1000;
const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;
const pad2 = (value) => String(value).padStart(2, '0');

const getStartOfMonthTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 0;
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
};

const getRangeStartTimestamp = (rangeFilter, nowTimestamp) => {
  if (rangeFilter === '7d') return nowTimestamp - 7 * DAY_MS;
  if (rangeFilter === '30d') return nowTimestamp - 30 * DAY_MS;
  if (rangeFilter === 'this_month') return getStartOfMonthTimestamp(nowTimestamp);
  return null;
};

const getMonthKey = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
};

const formatMonthLabel = (monthKey) => {
  const raw = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) return '';
  const [year, month] = raw.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
};

const formatStatementDateLabel = (timestamp) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
};

export const getBalanceSummary = (rawBalance, { viewerRole = 'customer' } = {}) => {
  const raw = Number(rawBalance || 0);
  const balance = Math.abs(raw) < 0.01 ? 0 : raw;
  const isAdminViewer = String(viewerRole || '').toLowerCase() === 'admin';
  if (balance > 0) {
    return {
      headline: 'Balance Due',
      directionLine: isAdminViewer ? 'Customer owes the store' : 'You owe the store',
      toneClass: 'positive',
    };
  }
  if (balance < 0) {
    return {
      headline: 'Advance Balance',
      directionLine: isAdminViewer ? 'Store owes the customer' : 'Store owes you this amount',
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
  if (
    !Array.isArray(transactions) ||
    transactions.length === 0 ||
    typeof getTimestamp !== 'function'
  ) {
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

export const applyCreditQuickFilters = (
  transactions,
  { typeFilter = 'all', rangeFilter = 'all', nowTimestamp = Date.now(), getTimestamp } = {}
) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];
  const normalizedTypeFilter = String(typeFilter || 'all').toLowerCase();
  const hasTypeFilter = normalizedTypeFilter === 'given' || normalizedTypeFilter === 'payment';
  const rangeStart = getRangeStartTimestamp(
    String(rangeFilter || 'all').toLowerCase(),
    Number(nowTimestamp)
  );
  const timestampGetter =
    typeof getTimestamp === 'function'
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

export const getRecentActivityHint = (
  lastTimestamp,
  { idleDays = 30, nowTimestamp = Date.now() } = {}
) => {
  const lastTxTimestamp = Number(lastTimestamp);
  if (!Number.isFinite(lastTxTimestamp) || lastTxTimestamp <= 0) return '';
  const days = Number(idleDays || 30);
  if (!Number.isFinite(days) || days <= 0) return '';
  const elapsed = Number(nowTimestamp) - lastTxTimestamp;
  if (elapsed < days * DAY_MS) return '';
  return `No activity in last ${Math.floor(days)} days. Consider sending a reminder.`;
};

export const buildMonthlyCreditStatements = (
  transactions,
  { getTimestamp, getDelta, maxStatements = 6 } = {}
) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];
  const timestampGetter =
    typeof getTimestamp === 'function'
      ? getTimestamp
      : (transaction) => new Date(transaction?.created_at || '').getTime();
  const deltaGetter =
    typeof getDelta === 'function' ? getDelta : (transaction) => Number(transaction?.amount || 0);

  const normalized = transactions
    .map((transaction, index) => {
      const timestamp = Number(timestampGetter(transaction));
      const delta = Number(deltaGetter(transaction));
      const balance = Number(transaction?.balance || 0);
      if (!Number.isFinite(timestamp) || !Number.isFinite(delta) || !Number.isFinite(balance))
        return null;
      return {
        index,
        timestamp,
        delta,
        balance,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestamp - b.timestamp || a.index - b.index);

  const grouped = new Map();

  normalized.forEach((transaction) => {
    const monthKey = getMonthKey(transaction.timestamp);
    if (!monthKey) return;

    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, {
        monthKey,
        monthLabel: formatMonthLabel(monthKey),
        startTimestamp: transaction.timestamp,
        endTimestamp: transaction.timestamp,
        transactionCount: 0,
        openingBalance: roundMoney(transaction.balance - transaction.delta),
        totalDebit: 0,
        totalCredit: 0,
        netChange: 0,
        closingBalance: roundMoney(transaction.balance),
      });
    }

    const group = grouped.get(monthKey);
    group.transactionCount += 1;
    group.endTimestamp = transaction.timestamp;
    group.closingBalance = roundMoney(transaction.balance);
    if (transaction.delta >= 0) {
      group.totalDebit = roundMoney(group.totalDebit + transaction.delta);
    } else {
      group.totalCredit = roundMoney(group.totalCredit + Math.abs(transaction.delta));
    }
    group.netChange = roundMoney(group.netChange + transaction.delta);
  });

  const limit = Number.isFinite(Number(maxStatements)) ? Math.max(1, Number(maxStatements)) : 6;

  return Array.from(grouped.values())
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .slice(0, limit)
    .map((group) => ({
      ...group,
      startDateLabel: formatStatementDateLabel(group.startTimestamp),
      endDateLabel: formatStatementDateLabel(group.endTimestamp),
      netTone: group.netChange > 0 ? 'debit' : group.netChange < 0 ? 'credit' : 'neutral',
    }));
};

export const truncateCreditDescription = (value, maxLength = 56) => {
  const text = String(value || '').trim();
  const limit = Number(maxLength);
  if (!text) return '';
  if (!Number.isFinite(limit) || limit < 4) return text;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).trimEnd()}...`;
};
