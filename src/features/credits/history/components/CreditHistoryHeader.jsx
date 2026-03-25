import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';

const PAYMENT_BADGE_RULES = [
  {
    id: 'gold',
    title: 'Gold Score',
    description: 'Earned when the balance is fully cleared and the dues are paid within 7 days.',
  },
  {
    id: 'silver',
    title: 'Silver Score',
    description: 'Earned when 2 or more payments are recorded within the last 60 days.',
  },
  {
    id: 'bronze',
    title: 'Bronze Score',
    description: 'Earned when at least 1 payment is recorded within the last 90 days.',
  },
  {
    id: 'streak',
    title: 'Streak Star',
    description: 'Earned when payments are made in 6 or more consecutive months.',
  },
  {
    id: 'refresh',
    title: 'Automatic updates',
    description: 'Badges refresh after new payments and after the credit history is reloaded, so recent behavior matters most.',
  },
];

const getBadgeCoinLabel = (badge) => {
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
  inactivityHint,
  error,
  success,
  isMobile,
  openAddModalWithType,
}) {
  const [showBadgeTooltip, setShowBadgeTooltip] = useState(false);
  const badgeTooltipRef = useRef(null);

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
                      Badges reward recent payment discipline. They update automatically when payment activity changes.
                    </p>
                    <ul className="payment-badge-tooltip-list">
                      {PAYMENT_BADGE_RULES.map((rule) => (
                        <li key={rule.id}>
                          <strong>{rule.title}:</strong> {rule.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              {(paymentBadgesLoading || paymentBadges.length > 0) ? (
                <div className="payment-badge-coin-list" aria-label="Payment badges">
                  {paymentBadgesLoading ? (
                    <>
                      <span className="payment-badge-coin neutral loading" aria-hidden="true">
                        <span className="payment-badge-coin-inner" />
                      </span>
                      <span className="payment-badge-coin neutral loading" aria-hidden="true">
                        <span className="payment-badge-coin-inner" />
                      </span>
                    </>
                  ) : (
                    paymentBadges.map((badge) => (
                      <span
                        key={badge.id || badge.label}
                        className={`payment-badge-coin ${badge.tone || 'neutral'}`}
                        title={badge.description || badge.label}
                        role="img"
                        aria-label={badge.label || 'Payment badge'}
                      >
                        <span className="payment-badge-coin-inner">{getBadgeCoinLabel(badge)}</span>
                      </span>
                    ))
                  )}
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

