import { useEffect, useMemo, useState } from 'react';
import { BarChart2, ShoppingCart, CreditCard, TrendingUp } from 'lucide-react';
import AdminPageHeader from '../components/AdminPageHeader';
import { formatCurrency, truncateUserName } from '../../../shared/utils/formatters';
import { formatDateTime } from '../../../shared/utils/dateTime';
import { asNumber } from '../utils/adminHelpers';

const formatTallyTimestamp = (value) => {
  if (!value) return 'Not saved yet';
  return formatDateTime(value, 'en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

function DailySalesSection({
  selectedDateKey,
  onDateChange,
  onRefresh,
  dailyCashTally,
  dailyCashTallySaving,
  dailyCashTallyError,
  canEditDailyCashTally,
  onSaveDailyCashTally,
  dailySalesLoading,
  dailySalesError,
  dailySalesSummary,
  selectedSalesBills,
}) {
  const [countedCashDraft, setCountedCashDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const fallbackBillDate = useMemo(() => new Date(), []);

  useEffect(() => {
    if (dailyCashTally) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCountedCashDraft(String(dailyCashTally.countedCashTotal ?? ''));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoteDraft(String(dailyCashTally.note || ''));
      return;
    }
    setCountedCashDraft('');
    setNoteDraft('');
  }, [
    dailyCashTally,
    dailyCashTally?.date,
    dailyCashTally?.countedCashTotal,
    dailyCashTally?.note,
  ]);

  const normalizedCashDraft = String(countedCashDraft || '').trim();
  const draftAmount = normalizedCashDraft === '' ? Number.NaN : Number(normalizedCashDraft);
  const savedCashDraft = dailyCashTally ? String(dailyCashTally.countedCashTotal ?? '') : '';
  const savedNoteDraft = String(dailyCashTally?.note || '');
  const isDirty = normalizedCashDraft !== savedCashDraft || noteDraft !== savedNoteDraft;
  const hasDraftValidationError = normalizedCashDraft !== '' && (!Number.isFinite(draftAmount) || draftAmount < 0);
  const canSubmit = canEditDailyCashTally && isDirty && !hasDraftValidationError && normalizedCashDraft !== '' && !dailyCashTallySaving;
  const hasSavedTally = Boolean(dailySalesSummary?.hasManualCashTally);
  const savedTallyText = hasSavedTally
    ? formatCurrency(dailySalesSummary.manualCashTally)
    : 'Not recorded';
  const savedDeltaText = hasSavedTally
    ? formatCurrency(dailySalesSummary.cashVariance)
    : 'No saved tally';
  const savedTallyMeta = hasSavedTally
    ? formatTallyTimestamp(dailySalesSummary.cashTallyUpdatedAt)
    : 'No saved tally yet';
  const savedTallyNote = String(dailySalesSummary.cashTallyNote || '').trim();
  const deltaToneClass = useMemo(() => {
    const value = Number(dailySalesSummary?.cashVariance || 0);
    if (value < 0) return 'negative';
    if (value > 0) return 'positive';
    return 'neutral';
  }, [dailySalesSummary?.cashVariance]);

  const handleReset = () => {
    if (dailyCashTally) {
      setCountedCashDraft(String(dailyCashTally.countedCashTotal ?? ''));
      setNoteDraft(String(dailyCashTally.note || ''));
      return;
    }
    setCountedCashDraft('');
    setNoteDraft('');
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    void onSaveDailyCashTally?.({
      date: selectedDateKey,
      countedCashTotal: draftAmount,
      note: noteDraft.trim(),
    });
  };

  return (
    <div className="daily-sales-summary">
      <AdminPageHeader
        className="section-header"
        title="Daily Sales Summary"
        actions={(
          <div className="daily-sales-controls">
            <input
              id="daily-sales-date"
              name="daily_sales_date"
              type="date"
              className="daily-sales-date-input"
              value={selectedDateKey}
              onChange={(event) => onDateChange(String(event.target.value || '').trim())}
            />
            <button
              type="button"
              className="admin-btn"
              onClick={onRefresh}
              disabled={dailySalesLoading}
            >
              {dailySalesLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}
      />

      {dailySalesError ? <p className="daily-sales-error">{dailySalesError}</p> : null}

      <div className="stats-grid daily-sales-cards">
        <div className="stat-card">
          <BarChart2 size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.totalBilled)}</h3>
            <p>Total Billed</p>
          </div>
        </div>
        <div className="stat-card">
          <ShoppingCart size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.cashCollected)}</h3>
            <p>Billed Cash</p>
          </div>
        </div>
        <div className="stat-card">
          <CreditCard size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.creditIssued)}</h3>
            <p>Credit Issued</p>
          </div>
        </div>
        <div className="stat-card">
          <TrendingUp size={22} />
          <div>
            <h3>{formatCurrency(dailySalesSummary.effectiveCashPicture)}</h3>
            <p>Cash Picture</p>
          </div>
        </div>
      </div>

      <section className="daily-sales-cash-panel">
        <div className="daily-sales-cash-head">
          <div>
            <h3>Daily Cash Tally</h3>
            <p>Save counted cash separately from billing so walk-in cash or shortages stay visible against billed cash.</p>
          </div>
          <div className="daily-sales-cash-metrics">
            <div className="daily-sales-cash-metric">
              <span>Saved tally</span>
              <strong>{savedTallyText}</strong>
            </div>
            <div className={`daily-sales-cash-metric ${deltaToneClass}`}>
              <span>Delta vs billed</span>
              <strong>{savedDeltaText}</strong>
            </div>
            <div className="daily-sales-cash-metric">
              <span>Last updated</span>
              <strong>{savedTallyMeta}</strong>
            </div>
          </div>
        </div>

        {savedTallyNote ? (
          <p className="daily-sales-cash-note-preview">
            Note: {savedTallyNote}
          </p>
        ) : null}

        {dailyCashTallyError ? <p className="daily-sales-cash-error">{dailyCashTallyError}</p> : null}

        <form className="daily-sales-cash-form" onSubmit={handleSubmit}>
          <label>
            <span>Counted cash</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={countedCashDraft}
              onChange={(event) => setCountedCashDraft(String(event.target.value || '').trimStart())}
              disabled={!canEditDailyCashTally || dailyCashTallySaving}
              placeholder="0.00"
            />
          </label>
          <label className="daily-sales-cash-form-note">
            <span>Note</span>
            <textarea
              rows={2}
              value={noteDraft}
              onChange={(event) => setNoteDraft(String(event.target.value || ''))}
              disabled={!canEditDailyCashTally || dailyCashTallySaving}
              placeholder="Optional reason for walk-in cash, short cash, or manual correction"
            />
          </label>
          <div className="daily-sales-cash-actions">
            <button
              type="submit"
              className="admin-btn primary"
              disabled={!canSubmit}
            >
              {dailyCashTallySaving ? 'Saving...' : 'Save Tally'}
            </button>
            <button
              type="button"
              className="admin-btn"
              onClick={handleReset}
              disabled={dailyCashTallySaving || !isDirty}
            >
              Reset
            </button>
          </div>
        </form>

        {!canEditDailyCashTally ? (
          <p className="daily-sales-cash-help">Only admins can save the daily cash tally.</p>
        ) : null}
        {hasDraftValidationError ? (
          <p className="daily-sales-cash-help">Enter a valid non-negative counted cash total before saving.</p>
        ) : null}
      </section>

      <div className="daily-sales-meta-row">
        <span>Transactions: <strong>{dailySalesSummary.txCount}</strong></span>
        <span>Paid Bills: <strong>{dailySalesSummary.paidBills}</strong></span>
        <span>Pending Bills: <strong>{dailySalesSummary.pendingBills}</strong></span>
        <span>Avg Ticket: <strong>{formatCurrency(dailySalesSummary.avgTicket)}</strong></span>
        <span>Cash Delta: <strong>{formatCurrency(dailySalesSummary.cashVariance)}</strong></span>
      </div>

      <div className="orders-table daily-sales-table">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Bill</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Credit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {selectedSalesBills.length === 0 ? (
              <tr>
                <td colSpan={7} className="orders-empty-row">No sales bills found for selected date.</td>
              </tr>
            ) : selectedSalesBills.map((bill) => (
                <tr key={bill.id}>
                  <td>{new Date(bill.created_at || fallbackBillDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{bill.bill_number || `#${bill.id}`}</td>
                <td>{truncateUserName(bill.customer_name || '-', 15)}</td>
                <td>{formatCurrency(asNumber(bill.total_amount, 0))}</td>
                <td>{formatCurrency(asNumber(bill.paid_amount, 0))}</td>
                <td>{formatCurrency(asNumber(bill.credit_amount, 0))}</td>
                <td>{String(bill.payment_status || '-').toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DailySalesSection;
