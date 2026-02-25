import { formatCurrency } from './formatters';

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateTime = (value) => new Date(value || Date.now()).toLocaleString('en-IN');

const formatDate = (value) => new Date(value || Date.now()).toLocaleDateString('en-IN');

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
  lines.push(`Bill: ${billNumber || ''}`);
  lines.push(`Date: ${formatDateTime(createdAt)}`);
  if (customerName) lines.push(`Customer: ${customerName}`);
  if (customerPhone) lines.push(`Phone: ${customerPhone}`);
  if (customerEmail) lines.push(`Email: ${customerEmail}`);
  if (customerAddress) lines.push(`Address: ${customerAddress}`);
  lines.push('');
  lines.push('Items:');
  if (!Array.isArray(items) || items.length === 0) {
    lines.push('- None');
  } else {
    items.forEach((it) => {
      const name = it.product_name || it.name || 'Item';
      const qty = toNumber(it.qty || it.quantity || 0);
      const unit = it.unit || '';
      const amount = toNumber(it.amount || 0);
      lines.push(`- ${name} ${qty}${unit ? ` ${unit}` : ''} : ${formatCurrency(amount)}`);
    });
  }
  lines.push('');
  lines.push(`Total: ${formatCurrency(totalAmount)}`);
  lines.push(`Paid: ${formatCurrency(paidAmount)}`);
  lines.push(`Credit: ${formatCurrency(creditAmount)}`);
  if (currentTotalCredit !== undefined && currentTotalCredit !== null) {
    lines.push(`Current Total Credit: ${formatCurrency(currentTotalCredit)}`);
  }
  lines.push(`Status: ${paymentStatus || ''}`);
  if (onlineStoreUrl) {
    lines.push('');
    lines.push(`Visit online: ${onlineStoreUrl}`);
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
  lines.push(`Credit Report for: ${customerName || 'Customer'}`);
  lines.push(`Date Range: ${fromDate || ''} to ${toDate || ''}`);
  lines.push(`Generated: ${formatDateTime(generatedAt)}`);
  lines.push('');
  if (!Array.isArray(transactions) || transactions.length === 0) {
    lines.push('No transactions in this range.');
    lines.push(`Period Ending Balance: ${formatCurrency(periodEndingBalance)}`);
    lines.push(`Current Day Balance: ${formatCurrency(currentDayBalance)}`);
  } else {
    lines.push('Transactions:');
    let totalGiven = 0;
    let totalPayment = 0;
    transactions.forEach((t) => {
      const amount = toNumber(t.amount);
      if (String(t.type || '').toLowerCase() === 'given') totalGiven += amount;
      if (String(t.type || '').toLowerCase() === 'payment') totalPayment += amount;
      lines.push(`- ${t.dateLabel || '-'} | ${t.typeLabel || '-'} | ${formatCurrency(amount)} | Balance: ${formatCurrency(toNumber(t.balance))}`);
      lines.push(`  Desc: ${t.description || '-'}`);
    });
    lines.push('');
    lines.push(`Total Given: ${formatCurrency(totalGiven)}`);
    lines.push(`Total Payment: ${formatCurrency(totalPayment)}`);
    lines.push(`Net Change: ${formatCurrency(totalGiven - totalPayment)}`);
    lines.push(`Period Ending Balance: ${formatCurrency(periodEndingBalance)}`);
    lines.push(`Current Day Balance: ${formatCurrency(currentDayBalance)}`);
  }
  lines.push('');
  if (onlineStoreUrl) {
    lines.push(`Visit online: ${onlineStoreUrl}`);
    lines.push('');
  }
  lines.push(thankYouLine || 'Thank you for shopping with us.');
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
  lines.push('Credit Ledger Update');
  lines.push(`Date: ${formatDate(entryDate)}`);
  lines.push('');
  lines.push(`New Entry: ${entryTypeLabel || '-'} | ${formatCurrency(toNumber(amount))}`);
  lines.push(`Description: ${description || 'No additional note'}`);
  if (reference) lines.push(`Reference: ${reference}`);
  lines.push('');
  lines.push(`Previous Balance: ${formatCurrency(toNumber(previousBalance))}`);
  lines.push(`Updated Balance: ${formatCurrency(toNumber(updatedBalance))}`);
  lines.push(`Current Total Credit: ${formatCurrency(toNumber(updatedBalance))}`);
  lines.push('');
  if (onlineStoreUrl) {
    lines.push(`Visit online: ${onlineStoreUrl}`);
    lines.push('');
  }
  lines.push(thankYouLine || 'Thank you for shopping with us.');
  return lines.join('\n');
};

export const buildCreditTransactionText = ({
  companyTitle,
  dateLabel,
  typeLabel,
  amount,
  description,
  reference,
  updatedBalance,
  onlineStoreUrl,
  thankYouLine
} = {}) => {
  const lines = [];
  lines.push(companyTitle || 'BARMAN STORE');
  lines.push('');
  lines.push('Transaction Update');
  lines.push(`Date: ${dateLabel || '-'}`);
  lines.push(`Type: ${typeLabel || '-'}`);
  lines.push(`Amount: ${formatCurrency(toNumber(amount))}`);
  lines.push(`Description: ${description || 'No additional note'}`);
  if (reference) lines.push(`Reference: ${reference}`);
  lines.push(`Updated Balance: ${formatCurrency(toNumber(updatedBalance))}`);
  lines.push(`Current Total Credit: ${formatCurrency(toNumber(updatedBalance))}`);
  lines.push('');
  if (onlineStoreUrl) {
    lines.push(`Visit online: ${onlineStoreUrl}`);
    lines.push('');
  }
  lines.push(thankYouLine || 'Thank you for shopping with us.');
  return lines.join('\n');
};
