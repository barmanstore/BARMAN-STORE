// Browser-facing ESM copy of the shared message-template helpers.
// Keep this aligned with shared/messageTemplates.cjs because Vite source
// modules cannot execute raw CommonJS module.exports files in the browser.

const INR_LOCALE = 'en-IN';
const INR_CURRENCY = 'INR';

const DEFAULT_STORE_TITLE = "বৰ্মন ষ্ট'ৰ";
const DEFAULT_THANK_YOU = 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।';
const DEFAULT_DESCRIPTION = 'টোকা নাই';
const DEFAULT_CUSTOMER_LABEL = 'গ্ৰাহক';
const PAYMENT_DAY_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_ENTRY_TYPE_LABELS = {
  bill: 'বিলৰ ধাৰ',
  correction: 'সংশোধন',
  entry: 'লেজাৰ এণ্ট্ৰি',
  given: 'দোকানৰ বাকি যোগ কৰা হৈছে',
  'manual sale': 'দোকানৰ বাকি যোগ কৰা হৈছে',
  payment: 'পৰিশোধ',
  reversal: 'এণ্ট্ৰি বাতিল',
};
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

const resolveStoreTitle = (value) => normalizeLabel(value, DEFAULT_STORE_TITLE);

const resolveThanksLine = (value) => normalizeLabel(value, DEFAULT_THANK_YOU);

const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

const dateKeyToUtcMs = (value) => {
  const raw = String(value || '').trim();
  if (!isDateKey(raw)) return Number.NaN;
  return Date.parse(`${raw}T00:00:00.000Z`);
};

const addDaysToDateKey = (value, days) => {
  const baseMs = dateKeyToUtcMs(value);
  if (!Number.isFinite(baseMs)) return '';
  return new Date(baseMs + (Math.max(0, Math.floor(Number(days) || 0)) * PAYMENT_DAY_MS)).toISOString().slice(0, 10);
};

const getTodayDateKey = (nowValue = Date.now()) => {
  const nowMs = typeof nowValue === 'number' ? nowValue : Date.parse(nowValue);
  const safeMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  return new Date(safeMs).toISOString().slice(0, 10);
};

const formatDueDateLabel = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isDateKey(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(INR_LOCALE);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(INR_LOCALE);
};

const toEntryTypeLabel = (value) => {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, ' ');
  return CUSTOMER_ENTRY_TYPE_LABELS[normalized] || normalizeLabel(raw);
};

const toPaymentStatusLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'paid') return 'পৰিশোধিত';
  if (normalized === 'pending') return 'বকেয়া';
  if (normalized === 'partial') return 'আংশিক';
  if (normalized === 'cancelled') return 'বাতিল';
  return normalizeLabel(value, '');
};

const buildMaintainScoreLine = (paymentProfile) => {
  if (!paymentProfile || typeof paymentProfile !== 'object') return '';
  const dueDateKey = String(paymentProfile.maintain_score_by_date || '').trim();
  const dueDateLabel = formatDueDateLabel(dueDateKey);
  const outstandingAmount = Number(
    paymentProfile.outstanding_amount
    ?? paymentProfile.current_balance
    ?? paymentProfile.balance
    ?? 0
  );
  if (!dueDateLabel || !Number.isFinite(outstandingAmount) || outstandingAmount <= 0) return '';

  const statusLabel = String(paymentProfile.label ?? paymentProfile.payment_status_label ?? '').trim();
  const statusValue = String(paymentProfile.status ?? paymentProfile.payment_status ?? '').trim().toLowerCase();
  const customerTag = String(paymentProfile.customer_tag || '').trim().toLowerCase();
  const normalizedStatus = statusLabel.toLowerCase();
  const nextStatusLabel = String(paymentProfile.next_status_label || '').trim();
  const graceDays = Math.max(0, Math.floor(Number(paymentProfile.grace_days) || 0));
  const graceEndDateKey = addDaysToDateKey(dueDateKey, graceDays);
  const graceEndDateLabel = formatDueDateLabel(graceEndDateKey);
  const todayDateKey = getTodayDateKey(paymentProfile.now_ms ?? paymentProfile.nowMs);
  const isNewCustomer = customerTag === 'insufficient_history'
    || statusValue === 'new'
    || normalizedStatus === 'new';
  const dueDatePassed = isDateKey(dueDateKey) && todayDateKey > dueDateKey;
  const gracePeriodEnded = isDateKey(graceEndDateKey) && todayDateKey > graceEndDateKey;

  if (gracePeriodEnded) {
    return 'আপোনাৰ পৰিশোধৰ গ্ৰেচ পিৰিয়ড শেষ হৈছে। অনুগ্ৰহ কৰি তৎক্ষণাত পৰিশোধ কৰক, নহ’লে পেমেন্ট স্কোৰ বেয়া হ’ব পাৰে।';
  }

  if (dueDatePassed) {
    const targetDateLabel = graceEndDateLabel || dueDateLabel;
    return `আপোনাৰ পৰিশোধ বাকি আছে। অনুগ্ৰহ কৰি ${targetDateLabel} ৰ ভিতৰত পৰিশোধ কৰক, নহ’লে পেমেন্ট স্কোৰ বেয়া হ’ব পাৰে।`;
  }

  if (normalizedStatus === 'excellent') {
    return `আপোনাৰ ${statusLabel} স্কোৰ বজাই ৰাখিবলৈ অনুগ্ৰহ কৰি ${dueDateLabel} ৰ আগতে পৰিশোধ কৰক।`;
  }

  if (isNewCustomer) {
    return `অনুগ্ৰহ কৰি ${dueDateLabel} ৰ আগতে পৰিশোধ কৰক। সময়মতে পৰিশোধ কৰিলে আপোনাৰ পেমেন্ট স্কোৰ গঢ়ি উঠিব পাৰে।`;
  }

  const targetStatusText = nextStatusLabel ? `${nextStatusLabel} status` : 'অধিক ভাল status';
  return `অনুগ্ৰহ কৰি ${dueDateLabel} ৰ আগতে পৰিশোধ কৰক। সময়মতে পৰিশোধ কৰিলে আপোনাৰ পেমেন্ট স্কোৰ উন্নত হৈ ${targetStatusText} পাব পাৰে।`;
};

const buildPaymentProfileLines = (paymentProfile) => {
  if (!paymentProfile || typeof paymentProfile !== 'object') return [];
  const creditLimit = Number(paymentProfile.credit_limit || 0);
  const utilization = Number(paymentProfile.credit_limit_utilization);
  const lines = [];
  const maintainScoreLine = buildMaintainScoreLine(paymentProfile);

  if (maintainScoreLine) {
    lines.push(maintainScoreLine);
  }

  if (creditLimit > 0) {
    lines.push(
      `ক্রেডিট লিমিট: ${formatCurrency(creditLimit)}${Number.isFinite(utilization) ? ` | ব্যৱহাৰ: ${utilization.toFixed(1)}%` : ''}`
    );
  }

  return lines;
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

const buildHeaderLines = ({ storeTitle, title, paymentProfile } = {}) => {
  const safeStoreTitle = resolveStoreTitle(storeTitle);
  const safeTitle = normalizeLabel(title, '');
  if (!safeStoreTitle && !safeTitle) return [];

  const rawScore = paymentProfile?.score ?? paymentProfile?.payment_score;
  const hasScore = rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore));
  const scoreValue = hasScore ? `${Math.round(Number(rawScore))}/100` : null;
  const statusLabel = String(paymentProfile?.label ?? paymentProfile?.payment_status_label ?? '').trim();
  const scoreLine = hasScore
    ? `স্কোৰ: ${scoreValue}${statusLabel ? ` | ${statusLabel}` : ''}`
    : (statusLabel ? `স্কোৰ: ${statusLabel}` : '');

  const headerText = compactJoin([
    safeStoreTitle,
    safeTitle,
    scoreLine,
    '━━━━━━━━━━━━━━',
  ]);
  return headerText ? headerText.split('\n') : [];
};

const buildFooterLines = ({ storeTitle, onlineStoreUrl, thankYouLine, endSuffix = '🙏' } = {}) => {
  const safeStoreTitle = resolveStoreTitle(storeTitle);
  const thanks = resolveThanksLine(thankYouLine);
  const footer = [
    onlineStoreUrl ? `অনলাইন দোকান: ${String(onlineStoreUrl).trim()}` : '',
    thanks ? `${thanks}${endSuffix ? ` ${String(endSuffix).trim()}` : ''}`.trim() : '',
    safeStoreTitle ? `— ${safeStoreTitle}` : '',
  ];
  const footerText = compactJoin(footer);
  return footerText ? footerText.split('\n') : [];
};

const buildStructuredMessage = ({
  companyTitle,
  title,
  detailLines = [],
  onlineStoreUrl,
  thankYouLine,
  endSuffix = '🙏',
  paymentProfile,
  headerLines,
  footerLines,
} = {}) => {
  const header = Array.isArray(headerLines)
    ? headerLines
    : buildHeaderLines({ storeTitle: companyTitle, title, paymentProfile });
  const footer = Array.isArray(footerLines)
    ? footerLines
    : buildFooterLines({
      storeTitle: companyTitle,
      onlineStoreUrl,
      thankYouLine,
      endSuffix,
    });

  return compactJoin([
    ...header,
    ...detailLines,
    ...footer,
  ]);
};

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
  paymentProfile,
  onlineStoreUrl,
  thankYouLine,
  maxTransactionLines = 8,
} = {}) => {
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const maxLines = Number.isFinite(Number(maxTransactionLines))
    ? Math.max(0, Number(maxTransactionLines))
    : 8;
  let totalGiven = 0;
  let totalPayment = 0;

  const transactionLines = safeTransactions
    .slice(0, maxLines > 0 ? maxLines : 0)
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
    paymentProfile,
    detailLines: [
      `গ্ৰাহক: ${normalizeLabel(customerName, DEFAULT_CUSTOMER_LABEL)}`,
      `সময়সীমা: ${normalizeLabel(fromDate, '-')} পৰা ${normalizeLabel(toDate, '-')} লৈ`,
      `তৈয়াৰ: ${formatDateTime(generatedAt)}`,
      ...buildPaymentProfileLines(paymentProfile),
      safeTransactions.length
        ? (maxLines > 0 ? `লেনদেন (${safeTransactions.length}):` : `লেনদেন (${safeTransactions.length}): সংক্ষেপিত`)
        : 'লেনদেন: নাই',
      ...transactionLines,
      maxLines > 0 && safeTransactions.length > transactionLines.length
        ? `+${safeTransactions.length - transactionLines.length} টা অধিক লেনদেন`
        : '',
      `মুঠ ধাৰ: ${formatCurrency(totalGiven)} | মুঠ পৰিশোধ: ${formatCurrency(totalPayment)} | নেট: ${formatCurrency(totalGiven - totalPayment)}`,
      `পিৰিয়ড শেষৰ বেলেঞ্চ: ${formatCurrency(periodEndingBalance)}`,
      `বৰ্তমান বেলেঞ্চ: ${formatCurrency(currentDayBalance)}`,
    ],
    onlineStoreUrl,
    thankYouLine,
    endSuffix: '',
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
  paymentProfile,
  onlineStoreUrl,
  thankYouLine,
} = {}) => buildStructuredMessage({
  companyTitle,
  title: 'ধাৰ লেজাৰ আপডেট',
  paymentProfile,
  detailLines: [
    `তাৰিখ: ${formatDate(entryDate)}`,
    `ধৰণ: ${toEntryTypeLabel(entryTypeLabel)} | পৰিমাণ: ${formatCurrency(amount)}`,
    `টোকা: ${normalizeLabel(description, DEFAULT_DESCRIPTION)}`,
    reference ? `ৰেফ: ${reference}` : '',
    `বেলেঞ্চ: ${formatCurrency(previousBalance)} -> ${formatCurrency(updatedBalance)}`,
    ...buildPaymentProfileLines(paymentProfile),
  ],
  onlineStoreUrl,
  thankYouLine,
  endSuffix: '',
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
  paymentProfile,
  onlineStoreUrl,
  thankYouLine,
} = {}) => buildStructuredMessage({
  companyTitle,
  title: 'লেনদেন আপডেট',
  paymentProfile,
  detailLines: [
    `তাৰিখ: ${normalizeLabel(dateLabel)}`,
    `ধৰণ: ${toEntryTypeLabel(typeLabel)} | পৰিমাণ: ${formatCurrency(amount)}`,
    `টোকা: ${normalizeLabel(description, DEFAULT_DESCRIPTION)}`,
    reference ? `ৰেফ: ${reference}` : '',
    `বেলেঞ্চ: ${formatCurrency(previousBalance)} -> ${formatCurrency(updatedBalance)}`,
    ...buildPaymentProfileLines(paymentProfile),
  ],
  onlineStoreUrl,
  thankYouLine,
  endSuffix: '',
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

  return buildStructuredMessage({
    companyTitle,
    title: resolvedTitle,
    detailLines: [
      `তাৰিখ: ${formatDate(normalizedDate)}`,
      safeItems.length ? `সামগ্ৰী (${safeItems.length}):` : 'সামগ্ৰী: নাই',
      ...itemLines,
    ],
    onlineStoreUrl,
    thankYouLine: resolvedThanks,
  });
};

export {
  buildBillShareText,
  buildCreditReportText,
  buildCreditEntryText,
  buildCreditTransactionText,
  buildPurchaseOrderDistributorNoticeText,
};
