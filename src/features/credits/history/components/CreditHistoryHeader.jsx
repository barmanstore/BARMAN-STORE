import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';
import scoreBands from '../../../../../shared/creditScoreBands.json';

const PAYMENT_BADGE_RULES = (Array.isArray(scoreBands) ? scoreBands : []).map((band) => ({
  id: String(band.key || band.label || '').trim() || 'status',
  title: `${band.label} (${band.min}-${band.max})`,
  description: band.description || '',
}));

const getBadgeCoinLabel = (badge) => {
  const shortLabel = String(badge?.shortLabel || '').trim();
  if (shortLabel) return shortLabel;

  const tone = String(badge?.tone || '').toLowerCase();
  if (tone === 'gold') return 'Gold';
  if (tone === 'silver') return 'Silver';
  if (tone === 'bronze') return 'Bronze';
  if (tone === 'streak') return 'Streak';

  const label = String(badge?.label || badge?.title || 'Badge').trim();
  if (!label) return 'Badge';
  return label.split(/\s+/).slice(0, 2).join(' ');
};

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
  const [showBadgeTooltip, setShowBadgeTooltip] = useState(false);
  const badgeTooltipRef = useRef(null);
  const hasPaymentScore = paymentBadgeSummary?.payment_score !== null
    && paymentBadgeSummary?.payment_score !== undefined
    && Number.isFinite(Number(paymentBadgeSummary?.payment_score));
  const paymentScore = hasPaymentScore ? Math.round(Number(paymentBadgeSummary.payment_score)) : null;
  const paymentStatusLabel = String(paymentBadgeSummary?.payment_status_label || '').trim();
  const paymentStatusTone = String(paymentBadgeSummary?.payment_status_tone || 'neutral').trim();
  const isNewCustomer = String(paymentBadgeSummary?.customer_tag || '').trim().toLowerCase() === 'insufficient_history'
    || String(paymentBadgeSummary?.payment_status || '').trim().toLowerCase() === 'new'
    || paymentStatusLabel.toLowerCase() === 'new';
  const showScoreValue = hasPaymentScore && !isNewCustomer;

  useEffect(() => {
    if (!showBadgeTooltip || typeof document === 'undefined') return undefined;

    const handlePointerDown = (event) => {
      if (!badgeTooltipRef.current?.contains(event.target)) {
        setShowBadgeTooltip(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowBadgeTooltip(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showBadgeTooltip]);

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
        <div className="balance-card-main">
          <div className="balance-card-copy">
            <span className="balance-label">{balanceSummary.headline}</span>
            <span className={`balance-amount ${balanceSummary.toneClass}`}>
              {formatCurrency(Math.abs(Number(balance || 0)))}
            </span>
            <span className="summary-direction">{balanceSummary.directionLine}</span>
            <span className="summary-last-line">{lastTransactionLine}</span>
            <span className="summary-trust-line">{trustLine}</span>
          </div>
          {showPaymentBadges && (
            <div className="balance-card-badge-side">
              <div className="payment-badge-help" ref={badgeTooltipRef}>
                <button
                  type="button"
                  className="payment-badge-help-btn"
                  aria-label="Show how payment badges work"
                  aria-expanded={showBadgeTooltip ? 'true' : 'false'}
                  aria-controls="payment-badge-tooltip"
                  onClick={() => setShowBadgeTooltip((current) => !current)}
                >
                  ?
                </button>
                {showBadgeTooltip ? (
                  <div
                    id="payment-badge-tooltip"
                    className="payment-badge-tooltip"
                    role="dialog"
                    aria-label="How payment badges work"
                  >
                    <div className="payment-badge-tooltip-title">How payment badges work</div>
                    <p className="payment-badge-tooltip-intro">
                      The score is based on recent payment behavior across billing periods. Paying on time improves your score,
                      while late or missed payments reduce it.
                    </p>
                    <ul className="payment-badge-tooltip-list">
                      {PAYMENT_BADGE_RULES.map((rule) => (
                        <li key={rule.id}>
                          <span className={`payment-badge-dot ${rule.id}`} aria-hidden="true" />
                          <strong>{rule.title}:</strong> {rule.description}
                        </li>
                      ))}
                    </ul>
                    <div className="payment-badge-tooltip-subtitle">How to improve your score:</div>
                    <ul className="payment-badge-tooltip-list">
                      <li>Pay before or on the due date</li>
                      <li>Avoid carrying overdue balances</li>
                      <li>Clear missed payments as early as possible</li>
                    </ul>
                    <p className="payment-badge-tooltip-note">
                      New customers may show a neutral score until enough payment history is available.
                    </p>
                  </div>
                ) : null}
              </div>
              {paymentStatusLabel ? (
                <div className={`payment-badge-single ${isNewCustomer ? 'new' : (paymentStatusTone || 'neutral')}`}>
                  <span className="payment-badge-label">{paymentStatusLabel}</span>
                  <strong className="payment-badge-score">{showScoreValue ? `${paymentScore}/100` : '—'}</strong>
                </div>
              ) : null}
            </div>
          )}
        </div>
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

