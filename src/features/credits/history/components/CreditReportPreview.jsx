import { Download } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';

function CreditReportPreview({
  showReport,
  reportSummary,
  reportText,
  customer,
  paymentBadgeSummary,
  handleCopyReport,
  handleSendWhatsApp,
  generatePDFReport,
  setShowReport,
  setReportSummary,
}) {
  if (!showReport) return null;
  const endingBalance = Number(reportSummary?.endingBalance || 0);
  const endingBalanceLabel = endingBalance < 0 ? 'Advance' : endingBalance > 0 ? 'Due' : 'Settled';
  const hasPaymentScore =
    paymentBadgeSummary?.payment_score !== null &&
    paymentBadgeSummary?.payment_score !== undefined &&
    Number.isFinite(Number(paymentBadgeSummary?.payment_score));
  const isNewCustomer =
    String(paymentBadgeSummary?.customer_tag || '')
      .trim()
      .toLowerCase() === 'insufficient_history' ||
    String(paymentBadgeSummary?.payment_status || '')
      .trim()
      .toLowerCase() === 'new';
  const statusLabel = String(paymentBadgeSummary?.payment_status_label || '').trim();
  const statusTag = String(paymentBadgeSummary?.payment_status_tag || '').trim();

  return (
    <div className="report-box">
      <div className="report-header">
        <strong>Credit Report {customer?.name ? `- ${customer.name}` : ''}</strong>
      </div>
      {reportSummary && (
        <div className="report-summary-line">
          <span>{reportSummary.entryCount} entries</span>
          <span>
            {reportSummary.fromDate} to {reportSummary.toDate}
          </span>
          <span>Total debits: {formatCurrency(reportSummary.totalDebit || 0)}</span>
          <span>Total credits: {formatCurrency(reportSummary.totalCredit || 0)}</span>
          <span>
            Ending balance: {endingBalanceLabel} {formatCurrency(Math.abs(endingBalance))}
          </span>
          {isNewCustomer ? (
            <span>Payment status: New</span>
          ) : hasPaymentScore ? (
            <span>
              Payment score: {Math.round(Number(paymentBadgeSummary.payment_score))}/100
              {statusLabel ? ` (${statusLabel}${statusTag ? ` · ${statusTag}` : ''})` : ''}
            </span>
          ) : null}
        </div>
      )}
      <textarea
        id="credit-report-preview"
        name="credit_report_preview"
        className="report-text"
        readOnly
        value={reportText}
      />
      <div className="report-actions">
        <button className="report-btn primary-action" onClick={handleCopyReport}>
          Copy Text
        </button>
        <button className="report-btn whatsapp primary-action" onClick={handleSendWhatsApp}>
          Share on WhatsApp
        </button>
        <button className="report-btn pdf secondary-action" onClick={generatePDFReport}>
          <Download size={14} /> PDF
        </button>
        <button
          className="report-btn secondary-action"
          onClick={() => {
            setShowReport(false);
            setReportSummary(null);
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default CreditReportPreview;
