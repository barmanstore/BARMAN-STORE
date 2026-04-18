export const PDF_TABLE_LAYOUT = {
  marginLeft: 14,
  marginRight: 14,
  fontSize: 9.5,
  cellPadding: 3.2,
  minCellHeight: 8,
  columnWeight: {
    date: 0.11,
    type: 0.09,
    reference: 0.12,
    amount: 0.14,
    balance: 0.16,
    description: 0.38,
  },
};

export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

const pad2 = (value) => String(value).padStart(2, '0');

export const toLocalDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const getTodayDateInputValue = () => toLocalDateKey(new Date());

export const formatPdfCurrency = (amount) => {
  const numeric = Number(amount || 0);
  const abs = Math.abs(numeric);
  const value = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return `${numeric < 0 ? '-' : ''}Rs ${value}`;
};

const formatCompactDateKey = (dateKey) => {
  const raw = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
};

export const getEffectiveTransactionDateKey = (transaction) => {
  const txDateRaw = transaction?.transaction_date ?? transaction?.transactionDate;
  if (txDateRaw) {
    if (typeof txDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txDateRaw)) {
      return txDateRaw;
    }
    const d = new Date(txDateRaw);
    if (!Number.isNaN(d.getTime())) {
      return toLocalDateKey(d);
    }
  }
  const tsRaw = transaction?.transaction_ts ?? transaction?.transactionTs;
  if (tsRaw) {
    const tsDate = new Date(tsRaw);
    if (!Number.isNaN(tsDate.getTime())) return toLocalDateKey(tsDate);
  }
  const created = new Date(transaction?.created_at || '');
  return toLocalDateKey(created);
};

export const getEffectiveTransactionTimestamp = (transaction) => {
  const tsRaw = transaction?.transaction_ts ?? transaction?.transactionTs;
  if (tsRaw) {
    const ts = new Date(tsRaw).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  const txDateRaw = transaction?.transaction_date ?? transaction?.transactionDate;
  if (txDateRaw) {
    if (typeof txDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(txDateRaw)) {
      const [year, month, day] = txDateRaw.split('-').map((v) => Number(v));
      const createdAt = new Date(transaction?.created_at || '');
      const withTime = !Number.isNaN(createdAt.getTime())
        ? new Date(
            year,
            month - 1,
            day,
            createdAt.getHours(),
            createdAt.getMinutes(),
            createdAt.getSeconds(),
            createdAt.getMilliseconds()
          )
        : new Date(year, month - 1, day);
      if (!Number.isNaN(withTime.getTime())) return withTime.getTime();
    }
    const d = new Date(txDateRaw);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const createdTs = new Date(transaction?.created_at || '').getTime();
  return Number.isFinite(createdTs) ? createdTs : 0;
};

export const compareTransactionsByDateDesc = (a, b) => {
  const timeDiff = getEffectiveTransactionTimestamp(b) - getEffectiveTransactionTimestamp(a);
  if (timeDiff !== 0) return timeDiff;
  return Number(b?.id || 0) - Number(a?.id || 0);
};

export const buildCreditHistoryDayGroups = (
  transactions,
  {
    getDateKey = getEffectiveTransactionDateKey,
    compareTransactions = compareTransactionsByDateDesc,
    formatDate = formatTransactionDate,
  } = {}
) => {
  const groups = new Map();
  (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    const dateKey = getDateKey(transaction) || 'Unknown';
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(transaction);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayTransactions]) => ({
      dateKey,
      dateLabel: /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? formatCompactDateKey(dateKey) : dateKey,
      dateLabelLong: /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
        ? formatDate({ transaction_date: dateKey }, { long: true })
        : dateKey,
      transactions: [...dayTransactions].sort(compareTransactions),
    }));
};

export const formatTransactionDate = (transaction, { long = false } = {}) => {
  const key = getEffectiveTransactionDateKey(transaction);
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const [year, month, day] = key.split('-').map((v) => Number(v));
    const localDate = new Date(year, month - 1, day);
    if (long) {
      return localDate.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
    return localDate.toLocaleDateString('en-IN');
  }
  return '-';
};

export const getPdfColumnStyles = (doc) => {
  const pageWidth =
    typeof doc?.internal?.pageSize?.getWidth === 'function'
      ? doc.internal.pageSize.getWidth()
      : 210;
  const usableWidth = pageWidth - PDF_TABLE_LAYOUT.marginLeft - PDF_TABLE_LAYOUT.marginRight;
  const w = PDF_TABLE_LAYOUT.columnWeight;
  return {
    0: { cellWidth: usableWidth * w.date },
    1: { cellWidth: usableWidth * w.type },
    2: { cellWidth: usableWidth * w.reference },
    3: { cellWidth: usableWidth * w.amount, halign: 'right' },
    4: { cellWidth: usableWidth * w.balance, halign: 'right' },
    5: { cellWidth: usableWidth * w.description, overflow: 'linebreak', valign: 'top' },
  };
};
