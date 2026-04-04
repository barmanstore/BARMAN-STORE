import { formatCurrency } from '../../../../shared/utils/formatters';

const PAYMENT_DAY_MS = 24 * 60 * 60 * 1000;

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

const getTodayDateKey = () => new Date().toISOString().slice(0, 10);

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

  const maintainScoreByDateKey = String(paymentBadgeSummary?.maintain_score_by_date || '').trim();
  const maintainScoreByDate = formatDueDateLabel(maintainScoreByDateKey);
  const graceDays = Math.max(0, Math.floor(Number(paymentBadgeSummary?.grace_days || 0)));
  const graceEndDateKey = addDaysToDateKey(maintainScoreByDateKey, graceDays);
  const graceEndDateLabel = formatDueDateLabel(graceEndDateKey);
  const todayDateKey = getTodayDateKey();
  const dueDatePassed = isDateKey(maintainScoreByDateKey) && todayDateKey > maintainScoreByDateKey;
  const gracePeriodEnded = isDateKey(graceEndDateKey) && todayDateKey > graceEndDateKey;
  const paymentStatusLabel = String(paymentBadgeSummary?.payment_status_label || '').trim();
  const nextStatusLabel = String(paymentBadgeSummary?.next_status_label || '').trim();
  const customerTag = String(paymentBadgeSummary?.customer_tag || '').trim().toLowerCase();
  const outstandingAmount = Number(paymentBadgeSummary?.outstanding_amount || 0);
  const visibleDeadlineLabel = dueDatePassed ? (graceEndDateLabel || maintainScoreByDate) : maintainScoreByDate;
  const showPayByNote = Boolean(visibleDeadlineLabel) && Number.isFinite(outstandingAmount) && outstandingAmount > 0;
  const normalizedStatus = paymentStatusLabel.toLowerCase();
  const isNewCustomer = customerTag === 'insufficient_history' || normalizedStatus === 'new';
  const payByHeading = gracePeriodEnded
    ? 'Grace period ended'
    : (dueDatePassed ? 'Grace period ends' : 'Current pay-by date');
  const payByDescription = gracePeriodEnded
    ? 'The due date and grace period have passed. Pay immediately to avoid a worse payment score.'
    : (dueDatePassed
      ? 'The due date has passed. Pay within this grace period to avoid hurting your payment score.'
      : (isNewCustomer
        ? 'Clear this first due on time to unlock your payment status.'
        : ((normalizedStatus === 'excellent')
        ? `Pay by this date to help keep your ${paymentStatusLabel} score.`
        : `Pay by this date to improve your payment score and move toward ${nextStatusLabel || 'a better status'}.`)));

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
          <div className={`credit-monthly-payby-note ${dueDatePassed ? 'is-overdue' : ''}`}>
            <span className="credit-monthly-payby-label">{payByHeading}</span>
            <strong>{visibleDeadlineLabel}</strong>
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
