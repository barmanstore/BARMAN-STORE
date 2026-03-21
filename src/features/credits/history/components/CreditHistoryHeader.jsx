import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';

function CreditHistoryHeader({
  backHref,
  backLabel,
  isAdminView,
  customer,
  balanceSummary,
  balance,
  ledgerSummary,
  lastTransactionLine,
  trustLine,
  billsHref,
  showPaymentBadges,
  paymentBadgesLoading,
  paymentBadges,
  paymentBadgeSummary,
  inactivityHint,
  error,
  success,
  isMobile,
  openAddModalWithType,
}) {
  return (
    <>
      <div className="page-header">
        <Link to={backHref} className="back-link">
          <ArrowLeft size={20} /> {backLabel}
        </Link>
        <div className="header-content">
          <h1>{isAdminView ? 'Credit History' : 'My Credit History'}</h1>
          {customer && <p className="customer-name">{customer.name}</p>}
        </div>
      </div>

      <section className="balance-card summary-hero-card">
        <span className="balance-label">{balanceSummary.headline}</span>
        <span className={`balance-amount ${balanceSummary.toneClass}`}>
          {formatCurrency(Math.abs(Number(balance || 0)))}
        </span>
        <span className="summary-direction">{balanceSummary.directionLine}</span>
        <span className="summary-last-line">{lastTransactionLine}</span>
        <span className="summary-trust-line">{trustLine}</span>
      </section>

      <section className="ledger-summary-strip">
        <div className="ledger-summary-card">
          <span className="ledger-summary-label">Total Debits</span>
          <strong className="ledger-summary-value debit">{formatCurrency(ledgerSummary?.totalDebit || 0)}</strong>
        </div>
        <div className="ledger-summary-card">
          <span className="ledger-summary-label">Total Credits</span>
          <strong className="ledger-summary-value credit">{formatCurrency(ledgerSummary?.totalCredit || 0)}</strong>
        </div>
        <div className="ledger-summary-card">
          <span className="ledger-summary-label">Running Balance</span>
          <strong className="ledger-summary-value">{formatCurrency(Math.abs(Number(balance || 0)))}</strong>
        </div>
      </section>

      {showPaymentBadges && (
        <section className="payment-badge-panel">
          <div className="payment-badge-header">
            <span className="payment-badge-title">Payment Badges</span>
            {paymentBadgeSummary?.last_payment_label ? (
              <span className="payment-badge-meta">Last paid {paymentBadgeSummary.last_payment_label}</span>
            ) : null}
          </div>
          {paymentBadgesLoading ? (
            <div className="payment-badge-loading">Loading badges...</div>
          ) : (
            paymentBadges.length === 0 ? (
              <div className="payment-badge-empty">No badges yet. Pay quickly to start earning your score.</div>
            ) : (
              <>
                <div className="payment-badge-list">
                  {paymentBadges.map((badge) => (
                    <span
                      key={badge.id || badge.label}
                      className={`payment-badge-chip ${badge.tone || 'neutral'}`}
                      title={badge.description || badge.label}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
                {paymentBadgeSummary?.summary_line ? (
                  <div className="payment-badge-summary">{paymentBadgeSummary.summary_line}</div>
                ) : null}
              </>
            )
          )}
          <div className="payment-badge-rules">
            <div><strong>How it works:</strong></div>
            <div>Gold Score: Balance cleared and paid within 7 days.</div>
            <div>Silver Score: 2+ payments in 60 days.</div>
            <div>Bronze Score: Any payment in 90 days.</div>
            <div>Streak Star: Pay every month for 6+ months.</div>
          </div>
        </section>
      )}

      {inactivityHint && (
        <div className="inactivity-hint">{inactivityHint}</div>
      )}

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {isAdminView && !isMobile && (
        <div className="actions-bar">
          <button className="admin-btn primary" onClick={() => openAddModalWithType('payment')}>
            <RefreshCw size={18} /> Add Payment
          </button>
          <button className="admin-btn" onClick={() => openAddModalWithType('given')}>
            <Plus size={18} /> Add Manual Sale
          </button>
          <Link to={billsHref} className="admin-btn secondary">
            View Bills
          </Link>
        </div>
      )}
    </>
  );
}

export default CreditHistoryHeader;

