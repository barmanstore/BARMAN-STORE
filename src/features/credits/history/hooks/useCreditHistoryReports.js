import { useMemo, useRef } from 'react';
import {
  getCreditEntryDelta,
  getCreditEntryDescription,
  getCreditEntrySourceLabel,
  getCreditPreviousBalance,
} from '../utils/creditLedgerPresentation.js';
import { buildMessagePreview } from '../../../../shared/utils/textPreview.js';
import { MAX_URL_LENGTH, buildWhatsAppUrl } from '../../../../shared/utils/whatsapp.js';

const WHATSAPP_LINE_LIMIT = 22;
const REPORT_TRANSACTION_LINE_STEPS = [8, 6, 5, 4, 3, 2, 1, 0];
const LAUNCH_COOLDOWN_MS = 2000;

const CREDIT_SHARE_TRIM_STEPS = [
  (line) => /^ৰেফ:/.test(line),
  (line) => /^অনলাইন দোকান:/.test(line),
  (line) => /ধন্যবাদ/.test(line),
  (line) => /^— /.test(line),
];

const CREDIT_REPORT_TRIM_STEPS = [
  (line) => /^অনলাইন দোকান:/.test(line),
  (line) => /ধন্যবাদ/.test(line),
  (line) => /^— /.test(line),
  (line) => /^\+\d+ টা অধিক লেনদেন$/.test(line),
  (line) => /^তৈয়াৰ:/.test(line),
];

const normalizeWhatsAppShareText = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const countMessageLines = (message) =>
  normalizeWhatsAppShareText(message)
    .split(/\r?\n/)
    .filter((line) => String(line || '').trim()).length;

const dropLastMatchingLine = (text, matcher) => {
  const lines = normalizeWhatsAppShareText(text).split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (matcher(lines[index])) {
      lines.splice(index, 1);
      break;
    }
  }
  return normalizeWhatsAppShareText(lines.join('\n'));
};

const getTrimStepsForShareType = (shareType) =>
  shareType === 'report' ? CREDIT_REPORT_TRIM_STEPS : CREDIT_SHARE_TRIM_STEPS;

const toPdfSafeAscii = (value, fallback = '') => {
  const normalized = String(value || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
};

export const isCreditShareTextWithinWhatsAppLimit = ({
  phone,
  text,
  maxUrlLength = MAX_URL_LENGTH,
  lineLimit = WHATSAPP_LINE_LIMIT,
} = {}) => {
  const normalizedText = normalizeWhatsAppShareText(text);
  if (!normalizedText) return false;
  if (countMessageLines(normalizedText) > lineLimit) return false;
  return buildWhatsAppUrl({ phone, text: normalizedText }).length <= maxUrlLength;
};

export const trimCreditShareTextForWhatsApp = ({
  phone,
  text,
  shareType = 'transaction',
  maxUrlLength = MAX_URL_LENGTH,
  lineLimit = WHATSAPP_LINE_LIMIT,
} = {}) => {
  const normalizedText = normalizeWhatsAppShareText(text);
  if (!normalizedText) return '';

  let current = normalizedText;
  if (
    isCreditShareTextWithinWhatsAppLimit({
      phone,
      text: current,
      maxUrlLength,
      lineLimit,
    })
  ) {
    return current;
  }

  for (const trimStep of getTrimStepsForShareType(shareType)) {
    const next = dropLastMatchingLine(current, trimStep);
    if (!next || next === current) continue;
    current = next;
    if (
      isCreditShareTextWithinWhatsAppLimit({
        phone,
        text: current,
        maxUrlLength,
        lineLimit,
      })
    ) {
      return current;
    }
  }

  return current;
};

const useCreditHistoryReports = ({
  creditHistory,
  creditIssues,
  customer,
  balance,
  paymentBadgeSummary,
  fromDate,
  toDate,
  logWhatsAppLaunch,
  setError,
  setSuccess,
  setReportText,
  setReportSummary,
  setShowReport,
  reportText,
  entryShareText,
  buildCreditReportText,
  buildCreditEntryText,
  buildCreditTransactionText,
  info,
  formatTransactionDate,
  getEffectiveTransactionDateKey,
  getEffectiveTransactionTimestamp,
  getTypeLabel,
  getHistoryForReport,
  sendWhatsAppSmart,
  FIVE_DAYS_MS,
  createPdfDoc,
  addAutoTable,
  addPdfFooterWithPagination,
  savePdf,
  safeFileName,
  PDF_TABLE_LAYOUT,
  formatPdfCurrency,
  getPdfColumnStyles,
}) => {
  const launchCooldownRef = useRef(0);
  const supersededEntryIds = useMemo(() => {
    const correctedEntryIds = new Set();
    for (const issue of Array.isArray(creditIssues) ? creditIssues : []) {
      const status = String(issue?.status || '')
        .trim()
        .toLowerCase();
      const customerResponseStatus = String(issue?.customer_response_status || '')
        .trim()
        .toLowerCase();
      const entryId = Number(issue?.credit_entry_id || 0);
      const correctionEntryId = Number(issue?.correction_entry_id || 0);
      const isFinalizedForReplacement =
        (customerResponseStatus === '' || customerResponseStatus === 'acknowledged') &&
        correctionEntryId > 0;
      if (status === 'corrected' && entryId > 0 && isFinalizedForReplacement) {
        correctedEntryIds.add(entryId);
      }
    }
    return correctedEntryIds;
  }, [creditIssues]);
  const presentCreditHistory = useMemo(
    () =>
      (Array.isArray(creditHistory) ? creditHistory : []).filter(
        (entry) => !supersededEntryIds.has(Number(entry?.id || 0))
      ),
    [creditHistory, supersededEntryIds]
  );

  const getEffectiveRange = (rangeOverride = null) => {
    const nextFromDate =
      rangeOverride && typeof rangeOverride === 'object'
        ? String(rangeOverride.fromDate || '').trim()
        : String(fromDate || '').trim();
    const nextToDate =
      rangeOverride && typeof rangeOverride === 'object'
        ? String(rangeOverride.toDate || '').trim()
        : String(toDate || '').trim();
    return { fromDate: nextFromDate, toDate: nextToDate };
  };

  const getReportRangeData = async (rangeOverride = null) => {
    const range = getEffectiveRange(rangeOverride);
    if (!range.fromDate || !range.toDate) {
      throw new Error('Please select both From and To dates for the report.');
    }
    if (range.fromDate > range.toDate) {
      throw new Error('From date cannot be later than To date.');
    }
    const sourceHistory =
      typeof getHistoryForReport === 'function'
        ? await getHistoryForReport({ fromDate: range.fromDate, toDate: range.toDate })
        : presentCreditHistory;
    const normalizedSourceHistory = (Array.isArray(sourceHistory) ? sourceHistory : []).filter(
      (entry) => !supersededEntryIds.has(Number(entry?.id || 0))
    );
    const filtered = normalizedSourceHistory
      .filter((transaction) => {
        const dateKey = getEffectiveTransactionDateKey(transaction);
        return Boolean(dateKey) && dateKey >= range.fromDate && dateKey <= range.toDate;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));
    const allThroughPeriod = normalizedSourceHistory
      .filter((transaction) => {
        const dateKey = getEffectiveTransactionDateKey(transaction);
        return Boolean(dateKey) && dateKey <= range.toDate;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));
    const periodEndingBalance =
      allThroughPeriod.length > 0
        ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
        : 0;
    const currentDayBalance = Number(balance || 0);
    return {
      range,
      sourceHistory: normalizedSourceHistory,
      filtered,
      periodEndingBalance,
      currentDayBalance,
    };
  };

  const buildPaymentProfilePayload = (summaryOverride = null, balanceOverride = null) => {
    const summary = summaryOverride || paymentBadgeSummary || null;
    const rawScore = summary?.payment_score;
    const hasScore =
      rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore));
    const statusLabel = String(summary?.payment_status_label || '').trim();
    const statusValue = String(summary?.payment_status || '')
      .trim()
      .toLowerCase();
    const isNewCustomer =
      String(summary?.customer_tag || '')
        .trim()
        .toLowerCase() === 'insufficient_history' || statusValue === 'new';
    const resolvedLabel = statusLabel || (isNewCustomer ? 'New' : '');
    const hasDueDateReminder = Boolean(String(summary?.maintain_score_by_date || '').trim());
    const hasCreditLimit = Number(summary?.credit_limit || 0) > 0;
    if (!hasScore && !resolvedLabel && !statusValue && !hasDueDateReminder && !hasCreditLimit)
      return null;
    return {
      ...summary,
      score: hasScore ? Number(rawScore) : null,
      label: resolvedLabel || null,
      tag: summary?.payment_status_tag || null,
      status: statusValue || null,
      payment_score: hasScore ? Number(rawScore) : null,
      current_balance: balanceOverride ?? summary?.current_balance ?? Number(balance || 0),
    };
  };

  const buildCreditReport = (transactions, from, to, options = {}) => {
    const sourceHistory = options.sourceHistory || presentCreditHistory;
    const allThroughPeriod = sourceHistory
      .filter((t) => {
        const dateKey = getEffectiveTransactionDateKey(t);
        return Boolean(dateKey) && dateKey <= to;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));
    const periodEndingBalance =
      allThroughPeriod.length > 0
        ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
        : 0;

    const normalizedTransactions = (transactions || []).map((transaction) => ({
      dateLabel: formatTransactionDate(transaction),
      typeLabel: getTypeLabel(transaction),
      type: transaction.type,
      amount: Number(transaction.amount) || 0,
      balance: Number(transaction.balance || 0),
      description:
        `${getCreditEntrySourceLabel(transaction)} | ${getCreditEntryDescription(transaction)}`.trim(),
    }));

    return buildCreditReportText({
      companyTitle: info.TITLE || 'BARMAN STORE',
      customerName: customer?.name || 'Customer',
      fromDate: from,
      toDate: to,
      generatedAt: Date.now(),
      transactions: normalizedTransactions,
      periodEndingBalance,
      currentDayBalance: parseFloat(balance || 0),
      paymentProfile: buildPaymentProfilePayload(),
      onlineStoreUrl: info.ONLINE_STORE_URL,
      maxTransactionLines: options.maxTransactionLines,
    });
  };

  const buildWhatsAppReportText = (transactions, from, to, sourceHistory) => {
    let finalText = '';
    for (const maxLines of REPORT_TRANSACTION_LINE_STEPS) {
      const candidate = buildCreditReport(transactions, from, to, {
        maxTransactionLines: maxLines,
        sourceHistory,
      });
      const preparedCandidate = trimCreditShareTextForWhatsApp({
        phone: customer?.phone,
        text: candidate,
        shareType: 'report',
      });
      finalText = preparedCandidate;
      if (
        isCreditShareTextWithinWhatsAppLimit({
          phone: customer?.phone,
          text: preparedCandidate,
        })
      ) {
        return preparedCandidate;
      }
    }
    return finalText;
  };

  const handleGenerateReport = async (rangeOverride = null) => {
    setError('');
    setSuccess('');
    setReportSummary(null);
    let rangeData;
    try {
      rangeData = await getReportRangeData(rangeOverride);
    } catch (err) {
      setError(err.message || 'Failed to generate report');
      return;
    }
    const { range, sourceHistory, filtered, periodEndingBalance } = rangeData;

    const totals = filtered.reduce(
      (acc, transaction) => {
        const delta = getCreditEntryDelta(transaction);
        if (delta >= 0) {
          acc.totalDebit += delta;
        } else {
          acc.totalCredit += Math.abs(delta);
        }
        return acc;
      },
      { totalDebit: 0, totalCredit: 0 }
    );
    const report = buildWhatsAppReportText(filtered, range.fromDate, range.toDate, sourceHistory);
    setReportText(report);
    setReportSummary({
      entryCount: filtered.length,
      fromDate: range.fromDate,
      toDate: range.toDate,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      endingBalance: periodEndingBalance,
      transactions: filtered.map((transaction) => {
        const delta = getCreditEntryDelta(transaction);
        return {
          id: Number(transaction?.id || 0),
          date: formatTransactionDate(transaction, { long: true }),
          type: getTypeLabel(transaction),
          reference: getCreditEntrySourceLabel(transaction),
          debit: delta >= 0 ? Math.abs(delta) : 0,
          credit: delta < 0 ? Math.abs(delta) : 0,
          balance: Number(transaction?.balance || 0),
          description: getCreditEntryDescription(transaction),
        };
      }),
    });
    setShowReport(true);
  };

  const handleCopyReport = async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setSuccess('Report copied to clipboard');
    } catch (_) {
      setError('Failed to copy report');
    }
  };

  const sendOnWhatsApp = async (text, meta = {}) => {
    if (!text) return;
    const now = Date.now();
    if (now - launchCooldownRef.current < LAUNCH_COOLDOWN_MS) return;
    launchCooldownRef.current = now;
    const preparedText = trimCreditShareTextForWhatsApp({
      phone: customer?.phone,
      text,
      shareType: meta.type || 'transaction',
    });
    const result = await sendWhatsAppSmart({
      phone: customer?.phone,
      text: preparedText,
    });
    const shareType = String(meta?.type || 'report')
      .trim()
      .toLowerCase();
    const shareTypeLabel =
      shareType === 'transaction'
        ? 'transaction update'
        : shareType === 'entry'
          ? 'new entry update'
          : 'credit report';
    const status = result.status;
    const preview = buildMessagePreview(preparedText, 280);
    if (typeof logWhatsAppLaunch === 'function') {
      try {
        await logWhatsAppLaunch({
          customer_id: customer?.id,
          phone: customer?.phone,
          type: meta.type || 'report',
          status,
          message_preview: preview,
          context_type: meta.contextType || null,
          context_id: meta.contextId || null,
          trigger_source: meta.triggerSource || 'button_click',
        });
      } catch (_) {
        // Keep WhatsApp launch flow resilient; logging is best-effort.
      }
    }
    if (status === 'blocked_no_phone') {
      setError('Customer phone is missing or invalid. Please update phone and try again.');
      return;
    }
    if (status === 'opened_with_copy') {
      setSuccess(
        `Copied ${shareTypeLabel} message. WhatsApp opened; tap Send to deliver.`
      );
      return;
    }
    if (status === 'opened_without_copy') {
      setError(
        `WhatsApp opened for ${shareTypeLabel}. Please paste the prepared message, then tap Send.`
      );
    }
  };

  const buildReportPdfDocument = ({
    filtered,
    fromDate,
    toDate,
    periodEndingBalance,
    currentDayBalance,
  }) => {
    const doc = createPdfDoc();
    const primaryColor = [41, 128, 185];
    const secondaryColor = [52, 73, 94];
    const accentColor = [39, 174, 96];

    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, 210, 45, 'F');

    const pdfTitle = toPdfSafeAscii(info.TITLE, 'BARMAN STORE');
    const pdfSubtitle = toPdfSafeAscii(
      info.SUB_TITLE,
      'Quality Groceries & Everyday Essentials'
    );
    const pdfContact = toPdfSafeAscii(`${info.EMAIL || ''} | ${info.CONTACT || ''}`, 'Contact');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(pdfTitle, 105, 18, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfSubtitle, 105, 28, { align: 'center' });

    doc.setFontSize(9);
    doc.text(pdfContact, 105, 38, { align: 'center' });

    doc.setTextColor(...secondaryColor);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Credit Report', 105, 55, { align: 'center' });

    doc.setDrawColor(200, 200, 200);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(14, 62, 182, 28, 3, 3, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...secondaryColor);
    doc.text('Customer Details', 20, 72);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Name: ${customer?.name || 'N/A'}`, 20, 80);
    doc.text(`Phone: ${customer?.phone || 'N/A'}`, 100, 80);
    doc.text(`Email: ${customer?.email || 'N/A'}`, 20, 86);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Period: ${fromDate} to ${toDate}`, 100, 86);

    if (filtered.length > 0) {
      const tableData = filtered.map((transaction) => {
        const delta = getCreditEntryDelta(transaction);
        return [
          formatTransactionDate(transaction),
          getTypeLabel(transaction),
          getCreditEntrySourceLabel(transaction),
          {
            content: delta >= 0 ? formatPdfCurrency(Math.abs(delta)) : '-',
            styles: { halign: 'right' },
          },
          {
            content: delta < 0 ? formatPdfCurrency(Math.abs(delta)) : '-',
            styles: { halign: 'right' },
          },
          {
            content: formatPdfCurrency(Number(transaction.balance || 0)),
            styles: { halign: 'right' },
          },
          getCreditEntryDescription(transaction),
        ];
      });

      addAutoTable(doc, {
        startY: 95,
        head: [['Date', 'Type', 'Ref', 'Debit', 'Credit', 'Balance', 'Description']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [45, 45, 45],
          fontStyle: 'bold',
          fontSize: PDF_TABLE_LAYOUT.fontSize,
          cellPadding: PDF_TABLE_LAYOUT.cellPadding,
          lineWidth: 0,
        },
        bodyStyles: {
          fontSize: PDF_TABLE_LAYOUT.fontSize,
          textColor: [35, 35, 35],
          cellPadding: PDF_TABLE_LAYOUT.cellPadding,
          minCellHeight: PDF_TABLE_LAYOUT.minCellHeight,
          overflow: 'linebreak',
          valign: 'top',
          lineWidth: 0,
        },
        styles: {
          lineWidth: 0,
        },
        columnStyles: getPdfColumnStyles(doc),
        margin: { left: PDF_TABLE_LAYOUT.marginLeft, right: PDF_TABLE_LAYOUT.marginRight },
      });

      const finalY = Number(doc?.lastAutoTable?.finalY || 95) + 10;

      let totalDebit = 0;
      let totalCredit = 0;
      filtered.forEach((transaction) => {
        const delta = getCreditEntryDelta(transaction);
        if (delta >= 0) totalDebit += delta;
        else totalCredit += Math.abs(delta);
      });

      const summaryHeight = 42;
      const footerReserve = 14;
      const pageHeight = doc.internal.pageSize.height;
      const summaryTop = finalY + summaryHeight + footerReserve > pageHeight ? 20 : finalY;

      if (summaryTop !== finalY) {
        doc.addPage();
      }

      doc.setFillColor(248, 249, 250);
      doc.roundedRect(14, summaryTop, 182, 42, 3, 3, 'F');

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...secondaryColor);
      doc.text('Summary', 20, summaryTop + 10);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const summaryY = summaryTop + 18;
      doc.text(`Total Debits: ${formatPdfCurrency(totalDebit)}`, 20, summaryY);
      doc.text(`Total Credits: ${formatPdfCurrency(totalCredit)}`, 20, summaryY + 7);
      doc.text(`Net Change: ${formatPdfCurrency(totalDebit - totalCredit)}`, 20, summaryY + 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...secondaryColor);
      doc.text('Period Ending Balance:', 118, summaryY + 2);
      doc.setTextColor(
        periodEndingBalance >= 0 ? accentColor[0] : 231,
        periodEndingBalance >= 0 ? accentColor[1] : 76,
        periodEndingBalance >= 0 ? accentColor[2] : 60
      );
      doc.text(formatPdfCurrency(periodEndingBalance), 118, summaryY + 8);
      doc.setTextColor(...secondaryColor);
      doc.text('Current Day Balance:', 118, summaryY + 14);
      doc.setTextColor(
        currentDayBalance >= 0 ? accentColor[0] : 231,
        currentDayBalance >= 0 ? accentColor[1] : 76,
        currentDayBalance >= 0 ? accentColor[2] : 60
      );
      doc.text(formatPdfCurrency(currentDayBalance), 118, summaryY + 20);
    } else {
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text('No transactions found in the selected date range.', 105, 110, {
        align: 'center',
      });
      doc.setFontSize(9);
      doc.setTextColor(...secondaryColor);
      doc.text(`Period Ending Balance: ${formatPdfCurrency(periodEndingBalance)}`, 105, 118, {
        align: 'center',
      });
      doc.text(`Current Day Balance: ${formatPdfCurrency(currentDayBalance)}`, 105, 124, {
        align: 'center',
      });
    }

    addPdfFooterWithPagination(doc, (pdf, pageIndex, pageCount) => {
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(
        `Generated on ${new Date().toLocaleString('en-IN')} | Page ${pageIndex} of ${pageCount}`,
        105,
        pdf.internal.pageSize.height - 10,
        { align: 'center' }
      );
    });
    return doc;
  };

  const createReportPdfFile = async (rangeOverride = null) => {
    const { range, filtered, periodEndingBalance, currentDayBalance } =
      await getReportRangeData(rangeOverride);
    const doc = buildReportPdfDocument({
      filtered,
      fromDate: range.fromDate,
      toDate: range.toDate,
      periodEndingBalance,
      currentDayBalance,
    });
    const fileName = `Credit_Report_${safeFileName(customer?.name || 'Customer')}_${range.fromDate}_to_${range.toDate}.pdf`;
    const blob = doc.output('blob');
    return { file: new File([blob], fileName, { type: 'application/pdf' }), range, doc };
  };

  const handleSendWhatsApp = async () => {
    try {
      const { file, range } = await createReportPdfFile();
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          files: [file],
          title: 'Credit Report',
          text: `Credit report for ${customer?.name || 'customer'} (${range.fromDate} to ${range.toDate})`,
        });
        setSuccess('PDF ready in share sheet. Select WhatsApp to send.');
        return;
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
    await sendOnWhatsApp(reportText, {
      type: 'report',
      contextType: 'report_period',
      contextId: fromDate && toDate ? `${fromDate}|${toDate}` : null,
      triggerSource: 'button_click',
    });
  };

  const buildManualEntryText = ({
    companyTitle,
    entryType,
    amount,
    description,
    reference,
    entryDate,
    previousBalance,
    updatedBalance,
    paymentProfile,
    thankYouLine,
  }) =>
    buildCreditEntryText({
      companyTitle: companyTitle || info.TITLE || 'BARMAN STORE',
      entryTypeLabel: getTypeLabel(entryType),
      amount,
      description,
      reference,
      entryDate,
      previousBalance,
      updatedBalance,
      paymentProfile: buildPaymentProfilePayload(paymentProfile, updatedBalance),
      onlineStoreUrl: info.ONLINE_STORE_URL,
      thankYouLine,
    });

  const handleCopyEntryShare = async () => {
    if (!entryShareText) return;
    try {
      await navigator.clipboard.writeText(entryShareText);
      setSuccess('Entry message copied to clipboard');
    } catch {
      setError('Failed to copy entry message');
    }
  };

  const handleSendEntryWhatsApp = async () => {
    await sendOnWhatsApp(entryShareText, {
      type: 'entry',
      contextType: 'entry',
      contextId: null,
      triggerSource: 'button_click',
    });
  };

  const isTransactionWithinFiveDays = (transactionOrDate) => {
    const txTime =
      typeof transactionOrDate === 'object'
        ? getEffectiveTransactionTimestamp(transactionOrDate)
        : new Date(transactionOrDate).getTime();
    if (!Number.isFinite(txTime)) return false;
    const now = Date.now();
    return now >= txTime && now - txTime <= FIVE_DAYS_MS;
  };

  const buildTransactionShareText = (transaction) => {
    const amount = Number(transaction?.amount || 0);
    const updatedBalance = Number(transaction?.balance || 0);
    const previousBalance = getCreditPreviousBalance(transaction);

    return buildCreditTransactionText({
      companyTitle: info.TITLE || 'BARMAN STORE',
      dateLabel: formatTransactionDate(transaction),
      typeLabel: getTypeLabel(transaction),
      amount,
      description: getCreditEntryDescription(transaction),
      reference: getCreditEntrySourceLabel(transaction),
      previousBalance,
      updatedBalance,
      paymentProfile: buildPaymentProfilePayload(null, updatedBalance),
      onlineStoreUrl: info.ONLINE_STORE_URL,
    });
  };

  const handleSendTransactionWhatsApp = async (transaction) => {
    if (!isTransactionWithinFiveDays(transaction)) return;
    await sendOnWhatsApp(buildTransactionShareText(transaction), {
      type: 'transaction',
      contextType: 'transaction',
      contextId: transaction?.id ?? null,
      triggerSource: 'button_click',
    });
  };

  const generatePDFReport = async () => {
    setError('');
    setSuccess('');

    try {
      const { file, doc } = await createReportPdfFile();
      const fileName = String(file?.name || '').replace(/\.pdf$/i, '');
      savePdf(doc, fileName);
      setSuccess('PDF report downloaded successfully!');
    } catch (err) {
      setError(err?.message || 'Failed to generate PDF report.');
    }
  };

  return {
    buildCreditReport,
    handleGenerateReport,
    handleCopyReport,
    handleSendWhatsApp,
    buildManualEntryText,
    handleCopyEntryShare,
    handleSendEntryWhatsApp,
    isTransactionWithinFiveDays,
    handleSendTransactionWhatsApp,
    generatePDFReport,
  };
};

export default useCreditHistoryReports;
