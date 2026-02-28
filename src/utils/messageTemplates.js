import { formatCurrency } from './formatters';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateTime = (value) => new Date(value || Date.now()).toLocaleString('en-IN');
const formatDate = (value) => new Date(value || Date.now()).toLocaleDateString('en-IN');

const normalizeLabel = (value, fallback = '-') => {
  const raw = String(value || '').trim();
  return raw || fallback;
};

const toAssameseStoreTitle = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'বাৰ্মান ষ্ট' + 'ৰ';
  if (raw.toUpperCase() === 'BARMAN STORE') return 'বাৰ্মান ষ্ট' + 'ৰ';
  return raw;
};

const toAssameseThanks = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।';
  const normalized = raw.toLowerCase();
  if (normalized === 'thank you for shopping with us.' || normalized === 'thank you for shopping with us') {
    return 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।';
  }
  return raw;
};

const toEntryTypeLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'given') return 'ধাৰ দিয়া';
  if (normalized === 'payment') return 'পৰিশোধ';
  return normalizeLabel(value);
};

const toPaymentStatusLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'paid') return 'পৰিশোধিত';
  if (normalized === 'pending') return 'বকেয়া';
  if (normalized === 'partial') return 'আংশিক';
  if (normalized === 'cancelled') return 'বাতিল';
  return normalizeLabel(value, '');
};

const compactJoin = (lines) => lines.filter(Boolean).join('\n');

export const buildBillShareText = ({
  companyTitle,
  billNumber,
  createdAt,
  customerName,
  customerPhone,
  customerEmail,
  customerAddress,
  items = [],
  totalAmount = 0,
  paidAmount = 0,
  creditAmount = 0,
  currentTotalCredit,
  paymentStatus = '',
  onlineStoreUrl,
  thankYouLine,
  maxItemLines = 4,
} = {}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const itemLines = safeItems.slice(0, Math.max(1, maxItemLines)).map((it, index) => {
    const name = normalizeLabel(it.product_name || it.name, 'সামগ্ৰী');
    const qty = toNumber(it.qty ?? it.quantity ?? 0);
    const unit = String(it.unit || '').trim();
    const amount = toNumber(it.amount || 0);
    return `${index + 1}. ${name} x${qty}${unit ? ` ${unit}` : ''} ${formatCurrency(amount)}`;
  });
  const remainingCount = Math.max(0, safeItems.length - itemLines.length);

  const lines = [
    toAssameseStoreTitle(companyTitle),
    `বিল #${normalizeLabel(billNumber)}`,
    `তাৰিখ: ${formatDateTime(createdAt)}`,
    `গ্ৰাহক: ${normalizeLabel(customerName)}${customerPhone ? ` | ${customerPhone}` : ''}`,
    customerEmail ? `ইমেইল: ${customerEmail}` : '',
    customerAddress ? `ঠিকনা: ${customerAddress}` : '',
    `সামগ্ৰী (${safeItems.length}):`,
    ...itemLines,
    remainingCount > 0 ? `+${remainingCount} টা অধিক সামগ্ৰী` : '',
    `মুঠ ${formatCurrency(totalAmount)} | পৰিশোধ ${formatCurrency(paidAmount)} | ধাৰ ${formatCurrency(creditAmount)}`,
    currentTotalCredit !== undefined && currentTotalCredit !== null
      ? `বৰ্তমান ধাৰ: ${formatCurrency(currentTotalCredit)}`
      : '',
    toPaymentStatusLabel(paymentStatus) ? `স্থিতি: ${toPaymentStatusLabel(paymentStatus)}` : '',
    onlineStoreUrl ? `দোকান: ${onlineStoreUrl}` : '',
    toAssameseThanks(thankYouLine),
  ];

  return compactJoin(lines);
};

export const buildCreditReportText = ({
  companyTitle,
  customerName,
  fromDate,
  toDate,
  generatedAt,
  transactions = [],
  periodEndingBalance = 0,
  currentDayBalance = 0,
  onlineStoreUrl,
  thankYouLine,
  maxTransactionLines = 8,
} = {}) => {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  let totalGiven = 0;
  let totalPayment = 0;

  const transactionLines = safeTransactions
    .slice(0, Math.max(1, maxTransactionLines))
    .map((transaction, index) => {
      const amount = toNumber(transaction.amount);
      const kind = String(transaction.type || transaction.typeLabel || '').toLowerCase();
      if (kind === 'given') totalGiven += amount;
      if (kind === 'payment') totalPayment += amount;
      const dateLabel = normalizeLabel(transaction.dateLabel);
      const typeLabel = toEntryTypeLabel(transaction.typeLabel || transaction.type);
      const balance = formatCurrency(toNumber(transaction.balance));
      const summary = normalizeLabel(transaction.description, 'টোকা নাই');
      return `${index + 1}. ${dateLabel} | ${typeLabel} ${formatCurrency(amount)} | বেলেঞ্চ ${balance} | ${summary}`;
    });

  if (safeTransactions.length > transactionLines.length) {
    for (let index = transactionLines.length; index < safeTransactions.length; index += 1) {
      const amount = toNumber(safeTransactions[index]?.amount);
      const kind = String(
        safeTransactions[index]?.type || safeTransactions[index]?.typeLabel || ''
      ).toLowerCase();
      if (kind === 'given') totalGiven += amount;
      if (kind === 'payment') totalPayment += amount;
    }
  }

  const lines = [
    toAssameseStoreTitle(companyTitle),
    `ধাৰ ৰিপোৰ্ট: ${normalizeLabel(customerName, 'গ্ৰাহক')}`,
    `সময়সীমা: ${normalizeLabel(fromDate, '-')} পৰা ${normalizeLabel(toDate, '-')} লৈ`,
    `তৈয়াৰ: ${formatDateTime(generatedAt)}`,
    safeTransactions.length ? `লেনদেন (${safeTransactions.length}):` : 'লেনদেন: নাই',
    ...transactionLines,
    safeTransactions.length > transactionLines.length
      ? `+${safeTransactions.length - transactionLines.length} টা অধিক লেনদেন`
      : '',
    `মুঠ ধাৰ ${formatCurrency(totalGiven)} | মুঠ পৰিশোধ ${formatCurrency(totalPayment)} | নেট ${formatCurrency(totalGiven - totalPayment)}`,
    `বন্ধ বেলেঞ্চ: ${formatCurrency(periodEndingBalance)} | আজিৰ বেলেঞ্চ: ${formatCurrency(currentDayBalance)}`,
    onlineStoreUrl ? `দোকান: ${onlineStoreUrl}` : '',
    toAssameseThanks(thankYouLine),
  ];

  return compactJoin(lines);
};

export const buildCreditEntryText = ({
  companyTitle,
  entryTypeLabel,
  amount,
  description,
  reference,
  entryDate,
  previousBalance,
  updatedBalance,
  onlineStoreUrl,
  thankYouLine,
} = {}) => {
  const lines = [
    toAssameseStoreTitle(companyTitle),
    'ধাৰ লেজাৰ আপডেট',
    `তাৰিখ: ${formatDate(entryDate)}`,
    `ধৰণ: ${toEntryTypeLabel(entryTypeLabel)} | পৰিমাণ: ${formatCurrency(toNumber(amount))}`,
    `টোকা: ${normalizeLabel(description, 'টোকা নাই')}`,
    reference ? `ৰেফ: ${reference}` : '',
    `বেলেঞ্চ: ${formatCurrency(toNumber(previousBalance))} -> ${formatCurrency(toNumber(updatedBalance))}`,
    onlineStoreUrl ? `দোকান: ${onlineStoreUrl}` : '',
    toAssameseThanks(thankYouLine),
  ];

  return compactJoin(lines);
};

export const buildCreditTransactionText = ({
  companyTitle,
  dateLabel,
  typeLabel,
  amount,
  description,
  reference,
  previousBalance,
  updatedBalance,
  onlineStoreUrl,
  thankYouLine,
} = {}) => {
  const lines = [
    toAssameseStoreTitle(companyTitle),
    'লেনদেন আপডেট',
    `তাৰিখ: ${normalizeLabel(dateLabel)}`,
    `ধৰণ: ${toEntryTypeLabel(typeLabel)} | পৰিমাণ: ${formatCurrency(toNumber(amount))}`,
    `টোকা: ${normalizeLabel(description, 'টোকা নাই')}`,
    reference ? `ৰেফ: ${reference}` : '',
    `বেলেঞ্চ: ${formatCurrency(toNumber(previousBalance))} -> ${formatCurrency(toNumber(updatedBalance))}`,
    onlineStoreUrl ? `দোকান: ${onlineStoreUrl}` : '',
    toAssameseThanks(thankYouLine),
  ];

  return compactJoin(lines);
};
