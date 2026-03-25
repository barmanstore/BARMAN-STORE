// Browser-facing ESM copy of the shared message-template helpers.
// Keep this aligned with shared/messageTemplates.cjs because Vite source
// modules cannot execute raw CommonJS module.exports files in the browser.

const INR_LOCALE = 'en-IN';
const INR_CURRENCY = 'INR';

const DEFAULT_STORE_TITLE = "বৰ্মন ষ্ট'ৰ";
const DEFAULT_THANK_YOU = 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।';
const DEFAULT_DESCRIPTION = 'টোকা নাই';
const DEFAULT_CUSTOMER_LABEL = 'গ্ৰাহক';
const MOJIBAKE_PATTERN = /(?:Ã.|Â.|à¦|à§|ðŸ)/;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (amount) => (
  new Intl.NumberFormat(INR_LOCALE, {
    style: 'currency',
    currency: INR_CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(amount))
);

const formatDateTime = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleString(INR_LOCALE);
  }
  return date.toLocaleString(INR_LOCALE);
};

const formatDate = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString(INR_LOCALE);
  }
  return date.toLocaleDateString(INR_LOCALE);
};

const normalizeLabel = (value, fallback = '-') => {
  const raw = String(value || '').trim();
  return raw || fallback;
};

const normalizeSafeAssamese = (value, fallback) => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (MOJIBAKE_PATTERN.test(raw)) return fallback;
  return raw;
};

const toAssameseStoreTitle = (value) => {
  const raw = normalizeSafeAssamese(value, DEFAULT_STORE_TITLE);
  if (String(raw).trim().toUpperCase() === 'BARMAN STORE') return DEFAULT_STORE_TITLE;
  return raw;
};

const toAssameseThanks = (value) => {
  const raw = normalizeSafeAssamese(value, DEFAULT_THANK_YOU);
  const normalized = raw.toLowerCase();
  if (normalized === 'thank you for shopping with us.' || normalized === 'thank you for shopping with us') {
    return DEFAULT_THANK_YOU;
  }
  return raw;
};

const toEntryTypeLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'given') return 'ধাৰ দিয়া';
  if (normalized === 'payment') return 'পৰিশোধ';
  return normalizeLabel(value);
};

const toPaymentStatusLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'paid') return 'পৰিশোধিত';
  if (normalized === 'pending') return 'বকেয়া';
  if (normalized === 'partial') return 'আংশিক';
  if (normalized === 'cancelled') return 'বাতিল';
  return normalizeLabel(value, '');
};

const compactJoin = (lines) => lines.filter(Boolean).join('\n');

const formatCount = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  if (Math.abs(amount - Math.trunc(amount)) < 1e-9) return String(Math.trunc(amount));
  return amount.toFixed(2).replace(/\.?0+$/, '');
};

const formatPoNoticeRate = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '0/';
  const normalized = Number.isInteger(amount)
    ? String(amount)
    : String(Number(amount.toFixed(2))).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  return `${normalized}/`;
};

const formatPoNoticeItemName = (value, fallback = 'ITEM') => {
  const raw = String(value || '').trim().replace(/\s+/g, ' ');
  return (raw || fallback).toUpperCase();
};

const normalizePoNoticeDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  return raw.slice(0, 10);
};

const buildStructuredMessage = ({
  companyTitle,
  title,
  detailLines = [],
  onlineStoreUrl,
  thankYouLine,
  endSuffix = '🙏',
} = {}) => compactJoin([
  toAssameseStoreTitle(companyTitle),
  normalizeLabel(title),
  ...detailLines,
  onlineStoreUrl ? `দোকান: ${String(onlineStoreUrl).trim()}` : '',
  `${toAssameseThanks(thankYouLine)}${endSuffix ? ` ${String(endSuffix).trim()}` : ''}`.trim(),
]);

const buildBillShareText = ({
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
  const itemLines = safeItems.slice(0, Math.max(1, maxItemLines)).map((item, index) => {
    const name = normalizeLabel(item?.product_name || item?.name, 'সামগ্ৰী');
    const qty = formatCount(item?.qty ?? item?.quantity ?? 0);
    const unit = String(item?.unit || '').trim();
    const amount = formatCurrency(item?.amount || 0);
    return `${index + 1}. ${name} x${qty}${unit ? ` ${unit}` : ''} ${amount}`;
  });
  const remainingCount = Math.max(0, safeItems.length - itemLines.length);

  return buildStructuredMessage({
    companyTitle,
    title: 'বিল আপডেট',
    detailLines: [
      `বিল নং: #${normalizeLabel(billNumber)}`,
      `তাৰিখ: ${formatDateTime(createdAt)}`,
      `গ্ৰাহক: ${normalizeLabel(customerName, DEFAULT_CUSTOMER_LABEL)}${customerPhone ? ` | ${customerPhone}` : ''}`,
      customerEmail ? `ইমেইল: ${customerEmail}` : '',
      customerAddress ? `ঠিকনা: ${customerAddress}` : '',
      `সামগ্ৰী (${safeItems.length}):`,
      ...itemLines,
      remainingCount > 0 ? `+${remainingCount} টা অধিক সামগ্ৰী` : '',
      `মুঠ: ${formatCurrency(totalAmount)} | পৰিশোধ: ${formatCurrency(paidAmount)} | ধাৰ: ${formatCurrency(creditAmount)}`,
      currentTotalCredit !== undefined && currentTotalCredit !== null
        ? `বৰ্তমান ধাৰ: ${formatCurrency(currentTotalCredit)}`
        : '',
      toPaymentStatusLabel(paymentStatus) ? `স্থিতি: ${toPaymentStatusLabel(paymentStatus)}` : '',
    ],
    onlineStoreUrl,
    thankYouLine,
  });
};

const buildCreditReportText = ({
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
      const amount = toNumber(transaction?.amount);
      const kind = String(transaction?.type || transaction?.typeLabel || '').trim().toLowerCase();
      if (kind === 'given') totalGiven += amount;
      if (kind === 'payment') totalPayment += amount;
      return `${index + 1}. ${normalizeLabel(transaction?.dateLabel)} | ${toEntryTypeLabel(transaction?.typeLabel || transaction?.type)} ${formatCurrency(amount)} | বেলেঞ্চ ${formatCurrency(transaction?.balance || 0)} | ${normalizeLabel(transaction?.description, DEFAULT_DESCRIPTION)}`;
    });

  if (safeTransactions.length > transactionLines.length) {
    for (let index = transactionLines.length; index < safeTransactions.length; index += 1) {
      const amount = toNumber(safeTransactions[index]?.amount);
      const kind = String(safeTransactions[index]?.type || safeTransactions[index]?.typeLabel || '').trim().toLowerCase();
      if (kind === 'given') totalGiven += amount;
      if (kind === 'payment') totalPayment += amount;
    }
  }

  return buildStructuredMessage({
    companyTitle,
    title: 'ধাৰ ৰিপ\'ৰ্ট',
    detailLines: [
      `গ্ৰাহক: ${normalizeLabel(customerName, DEFAULT_CUSTOMER_LABEL)}`,
      `সময়সীমা: ${normalizeLabel(fromDate, '-')} পৰা ${normalizeLabel(toDate, '-')} লৈ`,
      `তৈয়াৰ: ${formatDateTime(generatedAt)}`,
      safeTransactions.length ? `লেনদেন (${safeTransactions.length}):` : 'লেনদেন: নাই',
      ...transactionLines,
      safeTransactions.length > transactionLines.length
        ? `+${safeTransactions.length - transactionLines.length} টা অধিক লেনদেন`
        : '',
      `মুঠ ধাৰ: ${formatCurrency(totalGiven)} | মুঠ পৰিশোধ: ${formatCurrency(totalPayment)} | নেট: ${formatCurrency(totalGiven - totalPayment)}`,
      `পিৰিয়ড শেষৰ বেলেঞ্চ: ${formatCurrency(periodEndingBalance)}`,
      `বৰ্তমান বেলেঞ্চ: ${formatCurrency(currentDayBalance)}`,
    ],
    onlineStoreUrl,
    thankYouLine,
    endSuffix: '🙏',
  });
};

const buildCreditEntryText = ({
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
} = {}) => buildStructuredMessage({
  companyTitle,
  title: 'ধাৰ লেজাৰ আপডেট',
  detailLines: [
    `তাৰিখ: ${formatDate(entryDate)}`,
    `ধৰণ: ${toEntryTypeLabel(entryTypeLabel)} | পৰিমাণ: ${formatCurrency(amount)}`,
    `টোকা: ${normalizeLabel(description, DEFAULT_DESCRIPTION)}`,
    reference ? `ৰেফ: ${reference}` : '',
    `বেলেঞ্চ: ${formatCurrency(previousBalance)} -> ${formatCurrency(updatedBalance)}`,
  ],
  onlineStoreUrl,
  thankYouLine,
});

const buildCreditTransactionText = ({
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
} = {}) => buildStructuredMessage({
  companyTitle,
  title: 'লেনদেন আপডেট',
  detailLines: [
    `তাৰিখ: ${normalizeLabel(dateLabel)}`,
    `ধৰণ: ${toEntryTypeLabel(typeLabel)} | পৰিমাণ: ${formatCurrency(amount)}`,
    `টোকা: ${normalizeLabel(description, DEFAULT_DESCRIPTION)}`,
    reference ? `ৰেফ: ${reference}` : '',
    `বেলেঞ্চ: ${formatCurrency(previousBalance)} -> ${formatCurrency(updatedBalance)}`,
  ],
  onlineStoreUrl,
  thankYouLine,
});

const buildPurchaseOrderDistributorNoticeText = ({
  companyTitle,
  title,
  orderDate,
  order_date,
  date,
  messageDate,
  items = [],
  onlineStoreUrl,
  thankYouLine,
} = {}) => {
  const normalizedDate = normalizePoNoticeDate(orderDate || order_date || date || messageDate);
  const rawTitle = String(title || '').trim();
  const resolvedTitle = /^order for\b/i.test(rawTitle) || !rawTitle ? 'অৰ্ডাৰ আপডেট' : rawTitle;
  const safeItems = Array.isArray(items) ? items : [];
  const itemLines = safeItems.map((item, index) => {
    const itemName = formatPoNoticeItemName(item?.product_name || item?.name || `Item ${index + 1}`);
    const rate = Number(item?.product_price ?? item?.price ?? item?.selling_price ?? item?.mrp ?? item?.unit_price ?? item?.rate ?? 0);
    const quantity = item?.quantity ?? 0;
    const uom = String(item?.uom || item?.unit || 'pcs').trim() || 'pcs';
    return `${index + 1}. ${itemName} (${formatPoNoticeRate(rate)}) ------------ ${formatCount(quantity)} ${uom}`;
  });
  const resolvedThanks = String(thankYouLine || 'ধন্যবাদ।').trim() || 'ধন্যবাদ।';

  return compactJoin([
    toAssameseStoreTitle(companyTitle),
    resolvedTitle,
    `তাৰিখ: ${formatDate(normalizedDate)}`,
    safeItems.length ? `সামগ্ৰী (${safeItems.length}):` : 'সামগ্ৰী: নাই',
    ...itemLines,
    onlineStoreUrl ? `VISIT: ${String(onlineStoreUrl).trim()}` : '',
    `===${resolvedThanks}🙏===`,
  ]);
};

export {
  buildBillShareText,
  buildCreditReportText,
  buildCreditEntryText,
  buildCreditTransactionText,
  buildPurchaseOrderDistributorNoticeText,
};
