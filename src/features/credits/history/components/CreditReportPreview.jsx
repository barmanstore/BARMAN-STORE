import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { DateRangeFilter } from '../../../../shared/components/filters';
import { formatCurrency } from '../../../../shared/utils/formatters';

const toDateToken = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDateByDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const buildDateRangePresets = () => {
  const today = new Date();
  const todayToken = toDateToken(today);
  const yesterday = shiftDateByDays(today, -1);
  return [
    { label: 'Today', value: [todayToken, todayToken] },
    { label: 'Yesterday', value: [toDateToken(yesterday), toDateToken(yesterday)] },
    { label: 'Last 7 Days', value: [toDateToken(shiftDateByDays(today, -6)), todayToken] },
    {
      label: 'This Month',
      value: [toDateToken(new Date(today.getFullYear(), today.getMonth(), 1)), todayToken],
    },
  ];
};

function CreditReportPreview({
  showReport,
  reportSummary,
  customer,
  fromDate,
  toDate,
  setFromDate,
  setToDate,
  handleGenerateReport,
  handleCopyReport,
  handleSendWhatsApp,
  generatePDFReport,
  setShowReport,
  setReportSummary,
}) {
  const dateRangePresets = useMemo(() => buildDateRangePresets(), []);
  if (!showReport) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content credit-entry-modal credit-issue-popup fade-in-up">
        <div className="modal-header">
          <h2>Credit Report {customer?.name ? `- ${customer.name}` : ''}</h2>
          <button
            type="button"
            className="close-btn"
            onClick={() => {
              setShowReport(false);
              setReportSummary(null);
            }}
          >
            ×
          </button>
        </div>
        <div className="report-controls report-controls-light" id="credit-report-controls">
          <DateRangeFilter
            value={[fromDate, toDate]}
            onChange={([start, end]) => {
              const nextFromDate = String(start || '').trim();
              const nextToDate = String(end || '').trim();
              setFromDate(nextFromDate);
              setToDate(nextToDate);
              if (nextFromDate && nextToDate) {
                handleGenerateReport({ fromDate: nextFromDate, toDate: nextToDate });
              }
            }}
            width="100%"
            tone="sky"
            presets={dateRangePresets}
            helperText="Report date range"
            showIcon={false}
            showPlaceholderText={false}
            triggerPlaceholder="Select range"
            popoverAlign="left"
          />
        </div>
        <div className="credit-report-duration-view">
          {Array.isArray(reportSummary?.transactions) && reportSummary.transactions.length > 0 ? (
            <div className="credit-report-duration-list">
              {reportSummary.transactions.map((entry) => (
                <article key={entry.id || `${entry.date}-${entry.reference}`} className="credit-report-duration-row">
                  <div className="credit-report-duration-top">
                    <strong>{entry.type}</strong>
                    <span>{entry.date}</span>
                  </div>
                  <div className="credit-report-duration-meta">
                    <span>Ref: {entry.reference || '-'}</span>
                    <span>Debit: {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</span>
                    <span>Credit: {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</span>
                    <span>Balance: {formatCurrency(Math.abs(Number(entry.balance || 0)))}</span>
                  </div>
                  <p>{entry.description || 'No description'}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="credit-report-empty">No transactions found in the selected range.</div>
          )}
        </div>
        <div className="report-actions">
          <button className="report-btn primary-action" onClick={handleCopyReport}>
            Copy Text
          </button>
          <button className="report-btn whatsapp primary-action" onClick={handleSendWhatsApp}>
            Share PDF on WhatsApp
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
    </div>
  );
}

export default CreditReportPreview;
