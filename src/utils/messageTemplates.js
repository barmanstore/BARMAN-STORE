import { formatCurrency } from './formatters';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateTime = (value) => new Date(value || Date.now()).toLocaleString('en-IN');

const formatDate = (value) => new Date(value || Date.now()).toLocaleDateString('en-IN');

const localizeTypeLabel = (value) => {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  if (normalized === 'given') return 'ধাৰ দিয়া';
  if (normalized === 'payment') return 'পৰিশোধ';
  return raw || '-';
};

const localizePaymentStatus = (value) => {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  if (normalized === 'paid') return 'পরিশোধিত';
  if (normalized === 'pending') return 'বকেয়া';
  if (normalized === 'partial') return 'আংশিক';
  if (normalized === 'cancelled') return 'বাতিল';
  return raw;
};

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
  thankYouLine
} = {}) => {
  const lines = [];
  if (companyTitle) {
    lines.push(companyTitle);
    lines.push('');
  }
  lines.push(`বিল: ${billNumber || ''}`);
  lines.push(`তাৰিখ: ${formatDateTime(createdAt)}`);
  if (customerName) lines.push(`গ্ৰাহক: ${customerName}`);
  if (customerPhone) lines.push(`ফোন: ${customerPhone}`);
  if (customerEmail) lines.push(`ইমেইল: ${customerEmail}`);
  if (customerAddress) lines.push(`ঠিকনা: ${customerAddress}`);
  lines.push('');
  lines.push('সামগ্ৰীসমূহ:');
  if (!Array.isArray(items) || items.length === 0) {
    lines.push('- নাই');
  } else {
    items.forEach((it) => {
      const name = it.product_name || it.name || 'সামগ্ৰী';
      const qty = toNumber(it.qty || it.quantity || 0);
      const unit = it.unit || '';
      const amount = toNumber(it.amount || 0);
      lines.push(`- ${name} ${qty}${unit ? ` ${unit}` : ''} : ${formatCurrency(amount)}`);
    });
  }
  lines.push('');
  lines.push(`মুঠ: ${formatCurrency(totalAmount)}`);
  lines.push(`পরিশোধ: ${formatCurrency(paidAmount)}`);
  lines.push(`ধাৰ: ${formatCurrency(creditAmount)}`);
  if (currentTotalCredit !== undefined && currentTotalCredit !== null) {
    lines.push(`বৰ্তমান মুঠ ধাৰ: ${formatCurrency(currentTotalCredit)}`);
  }
  lines.push(`স্থিতি: ${localizePaymentStatus(paymentStatus) || ''}`);
  if (onlineStoreUrl) {
    lines.push('');
    lines.push(`অনলাইন চাওক: ${onlineStoreUrl}`);
  }
  if (thankYouLine) {
    lines.push('');
    lines.push(thankYouLine);
  }
  return lines.join('\n');
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
  thankYouLine
} = {}) => {
  const lines = [];
  lines.push(companyTitle || 'BARMAN STORE');
  lines.push('');
  lines.push(`ধাৰ প্ৰতিবেদন: ${customerName || 'গ্ৰাহক'}`);
  lines.push(`তাৰিখৰ পৰিসৰ: ${fromDate || ''} পৰা ${toDate || ''}`);
  lines.push(`প্ৰস্তুত কৰা সময়: ${formatDateTime(generatedAt)}`);
  lines.push('');
  if (!Array.isArray(transactions) || transactions.length === 0) {
    lines.push('এই সময়সীমাত কোনো লেনদেন নাই।');
    lines.push(`সময়সীমা শেষৰ বেলেঞ্চ: ${formatCurrency(periodEndingBalance)}`);
    lines.push(`বৰ্তমান দিনৰ বেলেঞ্চ: ${formatCurrency(currentDayBalance)}`);
  } else {
    lines.push('লেনদেনসমূহ:');
    let totalGiven = 0;
    let totalPayment = 0;
    transactions.forEach((t) => {
      const amount = toNumber(t.amount);
      if (String(t.type || '').toLowerCase() === 'given') totalGiven += amount;
      if (String(t.type || '').toLowerCase() === 'payment') totalPayment += amount;
      lines.push(`- ${t.dateLabel || '-'} | ${localizeTypeLabel(t.typeLabel || t.type)} | ${formatCurrency(amount)} | বেলেঞ্চ: ${formatCurrency(toNumber(t.balance))}`);
      lines.push(`  বিৱৰণ: ${t.description || '-'}`);
    });
    lines.push('');
    lines.push(`মুঠ ধাৰ দিয়া: ${formatCurrency(totalGiven)}`);
    lines.push(`মুঠ পৰিশোধ: ${formatCurrency(totalPayment)}`);
    lines.push(`নেট পৰিবর্তন: ${formatCurrency(totalGiven - totalPayment)}`);
    lines.push(`সময়সীমা শেষৰ বেলেঞ্চ: ${formatCurrency(periodEndingBalance)}`);
    lines.push(`বৰ্তমান দিনৰ বেলেঞ্চ: ${formatCurrency(currentDayBalance)}`);
  }
  lines.push('');
  if (onlineStoreUrl) {
    lines.push(`অনলাইন চাওক: ${onlineStoreUrl}`);
    lines.push('');
  }
  lines.push(thankYouLine || 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।');
  return lines.join('\n');
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
  thankYouLine
} = {}) => {
  const lines = [];
  lines.push(companyTitle || 'BARMAN STORE');
  lines.push('');
  lines.push('ধাৰ লেজাৰ আপডেট');
  lines.push(`তাৰিখ: ${formatDate(entryDate)}`);
  lines.push('');
  lines.push(`নতুন এণ্ট্রি: ${localizeTypeLabel(entryTypeLabel)} | ${formatCurrency(toNumber(amount))}`);
  lines.push(`বিৱৰণ: ${description || 'অতিৰিক্ত টোকা নাই'}`);
  if (reference) lines.push(`ৰেফাৰেন্স: ${reference}`);
  lines.push('');
  lines.push(`পূৰ্বৰ বেলেঞ্চ: ${formatCurrency(toNumber(previousBalance))}`);
  lines.push(`আপডেটেড বেলেঞ্চ: ${formatCurrency(toNumber(updatedBalance))}`);
  lines.push(`বৰ্তমান মুঠ ধাৰ: ${formatCurrency(toNumber(updatedBalance))}`);
  lines.push('');
  if (onlineStoreUrl) {
    lines.push(`অনলাইন চাওক: ${onlineStoreUrl}`);
    lines.push('');
  }
  lines.push(thankYouLine || 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।');
  return lines.join('\n');
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
  thankYouLine
} = {}) => {
  const lines = [];
  lines.push(companyTitle || 'BARMAN STORE');
  lines.push('');
  lines.push('লেনদেন আপডেট');
  lines.push(`তাৰিখ: ${dateLabel || '-'}`);
  lines.push(`ধৰণ: ${localizeTypeLabel(typeLabel)}`);
  lines.push(`পৰিমাণ: ${formatCurrency(toNumber(amount))}`);
  lines.push(`বিৱৰণ: ${description || 'অতিৰিক্ত টোকা নাই'}`);
  if (reference) lines.push(`ৰেফাৰেন্স: ${reference}`);
  lines.push(`পূৰ্বৰ বেলেঞ্চ: ${formatCurrency(toNumber(previousBalance))}`);
  lines.push(`আপডেটেড বেলেঞ্চ: ${formatCurrency(toNumber(updatedBalance))}`);
  lines.push('');
  if (onlineStoreUrl) {
    lines.push(`অনলাইন চাওক: ${onlineStoreUrl}`);
    lines.push('');
  }
  lines.push(thankYouLine || 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।');
  return lines.join('\n');
};
