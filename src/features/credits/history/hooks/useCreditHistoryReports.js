import {
  getCreditEntryDelta,
  getCreditEntryDescription,
  getCreditEntrySourceLabel,
  getCreditPreviousBalance,
} from '../utils/creditLedgerPresentation';

const useCreditHistoryReports = ({
  creditHistory,
  customer,
  balance,
  paymentBadgeSummary,
  fromDate,
  toDate,
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
  const buildPaymentProfilePayload = (summaryOverride = null, balanceOverride = null) => {
    const summary = summaryOverride || paymentBadgeSummary || null;
    const rawScore = summary?.payment_score;
    const hasScore = rawScore !== null && rawScore !== undefined && Number.isFinite(Number(rawScore));
    if (!hasScore && !summary?.payment_status_label) return null;
    return {
      ...summary,
      payment_score: hasScore ? Number(rawScore) : null,
      current_balance: balanceOverride ?? summary?.current_balance ?? Number(balance || 0),
    };
  };

  const buildCreditReport = (transactions, from, to) => {
    const allThroughPeriod = creditHistory
      .filter((t) => {
        const dateKey = getEffectiveTransactionDateKey(t);
        return Boolean(dateKey) && dateKey <= to;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));
    const periodEndingBalance = allThroughPeriod.length > 0
      ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
      : 0;

    const normalizedTransactions = (transactions || []).map((transaction) => ({
      dateLabel: formatTransactionDate(transaction),
      typeLabel: getTypeLabel(transaction),
      type: transaction.type,
      amount: Number(transaction.amount) || 0,
      balance: Number(transaction.balance || 0),
      description: `${getCreditEntrySourceLabel(transaction)} | ${getCreditEntryDescription(transaction)}`.trim(),
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
      thankYouLine: 'Thank you.',
    });
  };

  const handleGenerateReport = () => {
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates for the report.');
      return;
    }
    if (fromDate > toDate) {
      setError('From date cannot be later than To date.');
      return;
    }
    setError('');
    setSuccess('');
    setReportSummary(null);

    const filtered = creditHistory
      .filter((transaction) => {
        const dateKey = getEffectiveTransactionDateKey(transaction);
        return Boolean(dateKey) && dateKey >= fromDate && dateKey <= toDate;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));

    const totals = filtered.reduce((acc, transaction) => {
      const delta = getCreditEntryDelta(transaction);
      if (delta >= 0) {
        acc.totalDebit += delta;
      } else {
        acc.totalCredit += Math.abs(delta);
      }
      return acc;
    }, { totalDebit: 0, totalCredit: 0 });

    const allThroughPeriod = creditHistory
      .filter((transaction) => {
        const dateKey = getEffectiveTransactionDateKey(transaction);
        return Boolean(dateKey) && dateKey <= toDate;
      })
      .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));
    const endingBalance = allThroughPeriod.length > 0
      ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
      : 0;

    const report = buildCreditReport(filtered, fromDate, toDate);
    setReportText(report);
    setReportSummary({
      entryCount: filtered.length,
      fromDate,
      toDate,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      endingBalance,
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

  const sendOnWhatsApp = async (text) => {
    if (!text) return;
    const result = await sendWhatsAppSmart({
      phone: customer?.phone,
      text,
    });
    if (result.status === 'missing_phone') {
      setError('Customer phone is missing or invalid. Please update phone and try again.');
      return;
    }
    if (result.status === 'fallback_copy') {
      setSuccess('Message was long. Copied to clipboard; paste it in WhatsApp.');
      return;
    }
    if (result.status === 'fallback_no_copy') {
      setError('Message was long. Opened WhatsApp chat, please paste the message manually.');
    }
  };

  const handleSendWhatsApp = async () => {
    await sendOnWhatsApp(reportText);
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
  }) => buildCreditEntryText({
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
    thankYouLine: thankYouLine || 'Thank you.',
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
    await sendOnWhatsApp(entryShareText);
  };

  const isTransactionWithinFiveDays = (transactionOrDate) => {
    const txTime = typeof transactionOrDate === 'object'
      ? getEffectiveTransactionTimestamp(transactionOrDate)
      : new Date(transactionOrDate).getTime();
    if (!Number.isFinite(txTime)) return false;
    const now = Date.now();
    return now >= txTime && (now - txTime) <= FIVE_DAYS_MS;
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
      thankYouLine: 'Thank you.',
    });
  };

  const handleSendTransactionWhatsApp = async (transaction) => {
    if (!isTransactionWithinFiveDays(transaction)) return;
    await sendOnWhatsApp(buildTransactionShareText(transaction));
  };

  const generatePDFReport = () => {
    if (!fromDate || !toDate) {
      setError('Please select both From and To dates for the report.');
      return;
    }
    if (fromDate > toDate) {
      setError('From date cannot be later than To date.');
      return;
    }
    setError('');
    setSuccess('');

    try {
      const filtered = creditHistory
        .filter((transaction) => {
          const dateKey = getEffectiveTransactionDateKey(transaction);
          return Boolean(dateKey) && dateKey >= fromDate && dateKey <= toDate;
        })
        .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));

      const allThroughPeriod = creditHistory
        .filter((transaction) => {
          const dateKey = getEffectiveTransactionDateKey(transaction);
          return Boolean(dateKey) && dateKey <= toDate;
        })
        .sort((a, b) => getEffectiveTransactionTimestamp(a) - getEffectiveTransactionTimestamp(b));

      const periodEndingBalance = allThroughPeriod.length > 0
        ? Number(allThroughPeriod[allThroughPeriod.length - 1].balance || 0)
        : 0;
      const currentDayBalance = Number(balance || 0);

      const doc = createPdfDoc();
      const primaryColor = [41, 128, 185];
      const secondaryColor = [52, 73, 94];
      const accentColor = [39, 174, 96];

      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, 210, 45, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.setFont('helvetica', 'bold');
      doc.text(info.TITLE || 'BARMAN STORE', 105, 18, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(info.SUB_TITLE || 'Quality Groceries & Everyday Essentials', 105, 28, { align: 'center' });

      doc.setFontSize(9);
      const contactText = `${info.EMAIL || ''} | ${info.CONTACT || ''}`;
      doc.text(contactText, 105, 38, { align: 'center' });

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
            { content: delta >= 0 ? formatPdfCurrency(Math.abs(delta)) : '-', styles: { halign: 'right' } },
            { content: delta < 0 ? formatPdfCurrency(Math.abs(delta)) : '-', styles: { halign: 'right' } },
            { content: formatPdfCurrency(Number(transaction.balance || 0)), styles: { halign: 'right' } },
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
        const summaryTop = (finalY + summaryHeight + footerReserve > pageHeight) ? 20 : finalY;

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
        doc.setTextColor(periodEndingBalance >= 0 ? accentColor[0] : 231, periodEndingBalance >= 0 ? accentColor[1] : 76, periodEndingBalance >= 0 ? accentColor[2] : 60);
        doc.text(formatPdfCurrency(periodEndingBalance), 118, summaryY + 8);
        doc.setTextColor(...secondaryColor);
        doc.text('Current Day Balance:', 118, summaryY + 14);
        doc.setTextColor(currentDayBalance >= 0 ? accentColor[0] : 231, currentDayBalance >= 0 ? accentColor[1] : 76, currentDayBalance >= 0 ? accentColor[2] : 60);
        doc.text(formatPdfCurrency(currentDayBalance), 118, summaryY + 20);
      } else {
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text('No transactions found in the selected date range.', 105, 110, { align: 'center' });
        doc.setFontSize(9);
        doc.setTextColor(...secondaryColor);
        doc.text(`Period Ending Balance: ${formatPdfCurrency(periodEndingBalance)}`, 105, 118, { align: 'center' });
        doc.text(`Current Day Balance: ${formatPdfCurrency(currentDayBalance)}`, 105, 124, { align: 'center' });
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

      const fileName = `Credit_Report_${safeFileName(customer?.name || 'Customer')}_${fromDate}_to_${toDate}`;
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
