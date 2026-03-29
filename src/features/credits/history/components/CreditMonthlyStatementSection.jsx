import { formatCurrency } from '../../../../shared/utils/formatters';

const formatDueDateLabel = (value) => {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN');
};

function CreditMonthlyStatementSection({
  monthlyStatements,
  paymentBadgeSummary,
}) {
  if (!Array.isArray(monthlyStatements) || monthlyStatements.length === 0) return null;

  const maintainScoreByDate = formatDueDateLabel(paymentBadgeSummary?.maintain_score_by_date);
  const paymentStatusLabel = String(paymentBadgeSummary?.payment_status_label || '').trim();
  const outstandingAmount = Number(paymentBadgeSummary?.outstanding_amount || 0);
  const showPayByNote = Boolean(maintainScoreByDate) && Number.isFinite(outstandingAmount) && outstandingAmount > 0;
  const normalizedStatus = paymentStatusLabel.toLowerCase();
  const payByDescription = (normalizedStatus === 'excellent' || normalizedStatus === 'very good' || normalizedStatus === 'good')
    ? `Pay by this date to help keep your ${paymentStatusLabel} score.`
    : 'Pay by this date to help protect your payment score.';

  return (
    <section className="credit-monthly-statements">
      <div className="credit-monthly-statements-header">
        <div className="credit-monthly-statements-copy">
          <h2>Monthly statement view</h2>
          <p>
            This month-by-month summary is derived from your full ledger for easier tracking.
            Scores and due dates still follow the original credit entries.
          </p>
        </div>
        {showPayByNote ? (
          <div className="credit-monthly-payby-note">
            <span className="credit-monthly-payby-label">Current pay-by date</span>
            <strong>{maintainScoreByDate}</strong>
            <p>{payByDescription}</p>
          </div>
        ) : null}
      </div>

      <div className="credit-monthly-statement-grid">
        {monthlyStatements.map((statement) => {
          const netLabel = statement.netTone === 'debit'
            ? `Net added ${formatCurrency(statement.netChange)}`
            : (statement.netTone === 'credit'
              ? `Net paid ${formatCurrency(Math.abs(statement.netChange))}`
              : 'No net change');

          return (
            <article key={statement.monthKey} className="credit-monthly-statement-card">
              <div className="credit-monthly-statement-top">
                <div>
                  <span className="credit-monthly-statement-month">{statement.monthLabel}</span>
                  <span className="credit-monthly-statement-range">
                    {statement.startDateLabel} - {statement.endDateLabel}
                  </span>
                </div>
                <span className="credit-monthly-statement-count">
                  {statement.transactionCount} {statement.transactionCount === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              <div className="credit-monthly-statement-metrics">
                <div className="credit-monthly-statement-metric">
                  <span>Opening</span>
                  <strong>{formatCurrency(statement.openingBalance)}</strong>
                </div>
                <div className="credit-monthly-statement-metric">
                  <span>Charges</span>
                  <strong>{formatCurrency(statement.totalDebit)}</strong>
                </div>
                <div className="credit-monthly-statement-metric">
                  <span>Payments</span>
                  <strong>{formatCurrency(statement.totalCredit)}</strong>
                </div>
                <div className="credit-monthly-statement-metric">
                  <span>Closing</span>
                  <strong>{formatCurrency(statement.closingBalance)}</strong>
                </div>
              </div>

              <div className={`credit-monthly-statement-net ${statement.netTone}`}>
                {netLabel}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default CreditMonthlyStatementSection;
