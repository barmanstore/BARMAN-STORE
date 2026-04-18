import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, RefreshCw, User } from 'lucide-react';
import { resolveMediaSourceForDisplay } from '../../../../shared/services/api';
import { formatCurrency } from '../../../../shared/utils/formatters';
import scoreBands from '../../../../../shared/creditScoreBands.json';

const PAYMENT_BADGE_RULES = (Array.isArray(scoreBands) ? scoreBands : []).map((band) => ({
  id: String(band.key || band.label || '').trim() || 'status',
  title: `${band.label} (${band.min}-${band.max})`,
  description: band.description || '',
}));

const getInitials = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.149-.672.149-.198.297-.768.967-.942 1.167-.173.198-.347.223-.644.075-.297-.149-1.255-.462-2.39-1.475-.883-.786-1.48-1.75-1.653-2.047-.173-.297-.018-.458.13-.606.134-.133.298-.347.447-.52.149-.173.198-.297.298-.497.099-.198.05-.372-.025-.521-.075-.149-.672-1.617-.921-2.214-.242-.579-.487-.5-.672-.51l-.573-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.064 2.876 1.213 3.074c.149.198 2.102 3.2 5.076 4.487.709.306 1.26.489 1.69.626.71.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.125-.273-.198-.57-.347z" />
    <path d="M20.52 3.48A10.05 10.05 0 0012 0C5.383 0 .23 5.183.23 11.593c0 2.043.535 3.946 1.468 5.61L0 24l6.196-1.62a10.85 10.85 0 005.737 1.51h.005c5.617 0 10.78-5.183 10.78-11.593 0-3.103-1.186-5.997-3.18-8.307zM12 21.155a9.27 9.27 0 01-4.717-1.279l-.337-.2-3.676.962.981-3.582-.22-.362A8.773 8.773 0 013.23 11.594c0-4.86 4.015-8.813 8.77-8.813 2.344 0 4.537.914 6.187 2.575a8.648 8.648 0 012.573 6.223c0 4.86-4.015 8.813-8.77 8.813z" />
  </svg>
);

function CreditHistoryHeader({
  backHref,
  backLabel,
  isAdminView,
  customer,
  balanceSummary,
  balance,
  ledgerSummary,
  billsHref,
  showPaymentBadges,
  paymentBadgeSummary,
  inactivityHint,
  error,
  success,
  isMobile,
  openAddModalWithType,
  onContactWhatsApp,
}) {
  const [showBadgeTooltip, setShowBadgeTooltip] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState('');
  const badgeTooltipRef = useRef(null);
  const hasPaymentScore =
    paymentBadgeSummary?.payment_score !== null &&
    paymentBadgeSummary?.payment_score !== undefined &&
    Number.isFinite(Number(paymentBadgeSummary?.payment_score));
  const paymentScore = hasPaymentScore
    ? Math.round(Number(paymentBadgeSummary.payment_score))
    : null;
  const paymentStatusLabel = String(paymentBadgeSummary?.payment_status_label || '').trim();
  const paymentStatusTone = String(paymentBadgeSummary?.payment_status_tone || 'neutral').trim();
  const paymentHelperText = String(paymentBadgeSummary?.helper_text || '').trim();
  const paymentHelperMode = String(paymentBadgeSummary?.helper_mode || '')
    .trim()
    .toLowerCase();
  const isNewCustomer =
    String(paymentBadgeSummary?.customer_tag || '')
      .trim()
      .toLowerCase() === 'insufficient_history' ||
    String(paymentBadgeSummary?.payment_status || '')
      .trim()
      .toLowerCase() === 'new' ||
    paymentStatusLabel.toLowerCase() === 'new';
  const showScoreValue = hasPaymentScore && !isNewCustomer;
  const pageTitle = isAdminView ? 'Credit History' : 'My Credit History';
  const customerName = String(customer?.name || '').trim();
  const identityName = customerName || (isAdminView ? 'Customer' : 'My Account');
  const pageSubline = isAdminView ? 'Customer ledger overview' : 'Track every sale and payment';
  const customerSubline =
    String(customer?.phone || customer?.email || '').trim() ||
    (isAdminView ? 'Customer account' : 'Your account');

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

  // Reset avatar load failure when the customer profile image changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarLoadFailed(false);
  }, [customer?.profile_image]);

  useEffect(() => {
    let cancelled = false;
    let revokeUrl = null;

    const run = async () => {
      if (avatarLoadFailed || !customer?.profile_image) {
        setAvatarSrc('');
        return;
      }

      const resolved = await resolveMediaSourceForDisplay(customer.profile_image);
      if (cancelled) {
        if (resolved.revoke && resolved.src) URL.revokeObjectURL(resolved.src);
        return;
      }

      setAvatarSrc(resolved.src || '');
      revokeUrl = resolved.revoke ? resolved.src : null;
    };

    run();

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [customer?.profile_image, avatarLoadFailed]);

  return (
    <>
      <div className="page-header">
        <div className="page-header-main">
          <Link to={backHref} className="back-link">
            <ArrowLeft size={20} /> {backLabel}
          </Link>
          <div className="page-title-block">
            <h1>{pageTitle}</h1>
            <p className="page-subline">{pageSubline}</p>
          </div>
        </div>
      </div>

      <section className="balance-card summary-hero-card">
        <div className="balance-card-head">
          <div className="balance-card-identity">
            <div className="customer-identity-avatar" aria-hidden="true">
              {avatarSrc ? (
                <img src={avatarSrc} alt={identityName} onError={() => setAvatarLoadFailed(true)} />
              ) : customerName ? (
                <span className="customer-identity-avatar-fallback">
                  {getInitials(customerName)}
                </span>
              ) : (
                <User size={24} />
              )}
            </div>
            <div className="customer-identity-copy">
              <strong className="customer-identity-name">{identityName}</strong>
              <span className="customer-subline">{customerSubline}</span>
            </div>
            {onContactWhatsApp ? (
              <button
                type="button"
                className="customer-identity-whatsapp"
                onClick={onContactWhatsApp}
                title="Chat on WhatsApp"
                aria-label="Chat on WhatsApp"
              >
                <WhatsAppIcon />
              </button>
            ) : null}
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
                      Every new credit entry gets a due window based on the current payment status.
                      Clearing the oldest unpaid due on time improves the score, while late or
                      missed cycles reduce it.
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
                      <li>Clear the oldest unpaid due before the active due date</li>
                      <li>Earlier payment gives a bigger score lift than a last-day payment</li>
                      <li>Missing the extra 3-day grace causes a stronger downgrade</li>
                    </ul>
                    <p className="payment-badge-tooltip-note">
                      New customers stay in the New state until the first payment cycle is fully
                      judged.
                    </p>
                  </div>
                ) : null}
              </div>
              {paymentStatusLabel ? (
                <div
                  className={`payment-badge-single ${isNewCustomer ? 'new' : paymentStatusTone || 'neutral'}`}
                >
                  <span className="payment-badge-label">{paymentStatusLabel}</span>
                  <strong className="payment-badge-score">
                    {showScoreValue ? `${paymentScore}/100` : '—'}
                  </strong>
                </div>
              ) : null}
              {paymentHelperText ? (
                <p className={`payment-badge-helper-text ${paymentHelperMode || 'neutral'}`}>
                  {paymentHelperText}
                </p>
              ) : null}
            </div>
          )}
        </div>
        <div className="balance-card-main">
          <div className="balance-card-copy">
            <span className="balance-label">{balanceSummary.headline}</span>
            <span className={`balance-amount ${balanceSummary.toneClass}`}>
              {formatCurrency(Math.abs(Number(balance || 0)))}
            </span>
            {balanceSummary.directionLine ? (
              <span className="summary-direction">{balanceSummary.directionLine}</span>
            ) : null}
          </div>
        </div>
      </section>

      <section className="ledger-summary-strip">
        <div className="ledger-summary-card">
          <span className="ledger-summary-label">Total Debits</span>
          <strong className="ledger-summary-value debit">
            {formatCurrency(ledgerSummary?.totalDebit || 0)}
          </strong>
        </div>
        <div className="ledger-summary-card">
          <span className="ledger-summary-label">Total Credits</span>
          <strong className="ledger-summary-value credit">
            {formatCurrency(ledgerSummary?.totalCredit || 0)}
          </strong>
        </div>
        <div className="ledger-summary-card">
          <span className="ledger-summary-label">Running Balance</span>
          <strong className="ledger-summary-value">
            {formatCurrency(Math.abs(Number(balance || 0)))}
          </strong>
        </div>
      </section>

      {inactivityHint && <div className="inactivity-hint">{inactivityHint}</div>}

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
