import { Download } from 'lucide-react';
import SignedCurrency from '../../../../shared/components/SignedCurrency';

function CreditReportPreview({
  showReport,
  reportSummary,
  reportText,
  customer,
  handleCopyReport,
  handleSendWhatsApp,
  generatePDFReport,
  setShowReport,
  setReportSummary,
}) {
  if (!showReport) return null;

  return (
    <div className="report-box">
      <div className="report-header">
        <strong>Credit Report {customer?.name ? `- ${customer.name}` : ''}</strong>
      </div>
      {reportSummary && (
        <div className="report-summary-line">
          <span>{reportSummary.entryCount} entries</span>
          <span>{reportSummary.fromDate} to {reportSummary.toDate}</span>
          <span>Net change: <SignedCurrency amount={reportSummary.netChange} /></span>
          <span>Ending balance: <SignedCurrency amount={reportSummary.endingBalance} /></span>
        </div>
      )}
      <textarea id="credit-report-preview" name="credit_report_preview" className="report-text" readOnly value={reportText} />
      <div className="report-actions">
        <button className="report-btn primary-action" onClick={handleCopyReport}>Copy Text</button>
        <button className="report-btn whatsapp primary-action" onClick={handleSendWhatsApp}>Share on WhatsApp</button>
        <button className="report-btn pdf secondary-action" onClick={generatePDFReport}><Download size={14} /> PDF</button>
        <button className="report-btn secondary-action" onClick={() => { setShowReport(false); setReportSummary(null); }}>Close</button>
      </div>
    </div>
  );
}

export default CreditReportPreview;
