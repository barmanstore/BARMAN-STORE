import { memo } from 'react';
import { Plus } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import SignedCurrency from '../SignedCurrency';

const formatPriceTag = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '0/';
  const normalized = Number.isInteger(amount)
    ? String(amount)
    : String(Number(amount.toFixed(2))).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
  return `${normalized}/`;
};

const ProductCard = memo(function ProductCard({
  family,
  cardState,
  variant = 'default',
  isAddedState = false,
  animationDelay = '0s',
  onOpenDetails,
  onAdd,
  onDecrease,
  detailContent = null,
  onTouchStart,
  onTouchEnd,
  showMetaLine = true,
  showSwipeHint = false,
  imageLoading = 'lazy',
  imageFetchPriority = 'auto',
  ImageComponent = null,
}) {
  const {
    selectedVariation,
    previewVariation,
    hasMultipleVariations,
    optionCount,
    familyLowStock,
    selectedStock,
    selectedQty,
    familyCartQty,
    selectedLabel,
    priceValue,
    mrpValue,
    hasDiscount,
    discountPercent,
    savingsValue,
    showFromPrice,
    minPrice,
    stockTone,
    stockText,
    stockHint,
    metaLine,
    stockActionLabel,
  } = cardState;

  if (!selectedVariation) return null;

  const detailLabel = hasMultipleVariations ? `Options (${optionCount})` : 'Details';
  const Image = ImageComponent;

  const offerLabel = String(
    selectedVariation?.offerLabel
    || selectedVariation?.offerBadges?.[0]
    || selectedVariation?.offerDisplay?.display_offer_label
    || ''
  ).trim();
  const offerNote = offerLabel.replace(/^\s*(save\s+[^|]+|\d+% off)\s*(\|\s*)?/i, '').trim();
  const urgencyLabel = selectedStock > 0 && selectedStock <= 5 ? `Only ${selectedStock} left` : '';
  const offerToneLabel = hasDiscount
    ? (offerLabel ? (discountPercent >= 25 ? 'Best Deal' : 'Live Offer') : 'Price Drop')
    : (offerLabel ? 'Live Offer' : '');

  return (
    <article
      className={`product-card family-card fade-in-up glass-product-card glass-product-card--${variant} ${familyLowStock ? 'low-stock-card' : 'high-stock-card'} ${isAddedState ? 'is-added' : ''}`}
      style={{ animationDelay }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        className="product-card-hero"
        onClick={onOpenDetails}
        aria-label={`View ${family.name}`}
      >
        <div className="glass-oval-frame">
          <div className="glass-oval-frame-inner">
            {Image ? (
              <Image
                src={previewVariation?.image}
                alt={family.name}
                className="glass-product-image"
                loading={imageLoading}
                fetchPriority={imageFetchPriority}
                fallbackProduct={previewVariation?.raw || selectedVariation.raw}
                width={variant === 'compact' ? 288 : 320}
                height={variant === 'compact' ? 224 : 280}
              />
            ) : (
              <img
                src={previewVariation?.image || ''}
                alt={family.name}
                className="glass-product-image"
                loading={imageLoading}
                width={variant === 'compact' ? 288 : 320}
                height={variant === 'compact' ? 224 : 280}
              />
            )}
          </div>
          <div className="glass-frame-sheen" aria-hidden="true" />
        </div>
        <div className="card-badges">
          <span className="price-corner-tag">{formatPriceTag(priceValue)}</span>
          {hasMultipleVariations ? (
            <span className="card-option-pill">{optionCount} options</span>
          ) : null}
          {hasDiscount ? (
            <span className="card-discount-pill">{Math.max(1, discountPercent)}% OFF</span>
          ) : null}
        </div>
      </button>

      <div className="product-card-body">
        <div className="product-card-copy">
          <div className="product-title-row">
            <h3 className="product-name">{family.name}</h3>
            {isAddedState ? <span className="card-added-pill">Added</span> : null}
          </div>

          {showMetaLine && metaLine ? <p className="product-meta-line">{metaLine}</p> : null}
          {selectedLabel ? <p className="product-weight">{selectedLabel}</p> : null}

          {hasDiscount ? (
            <div className="card-offer-hero">
              <div className="card-offer-heading">
                {offerToneLabel ? <span className="card-offer-chip">{offerToneLabel}</span> : null}
                {offerNote ? <span className="card-offer-note">{offerNote}</span> : null}
              </div>
              <div className="card-offer-pricing">
                <strong className="card-sale-price">
                  <SignedCurrency amount={priceValue} />
                </strong>
                <span className="card-original-price">{formatCurrency(mrpValue)}</span>
              </div>
              <div className="card-offer-summary">
                <strong>{Math.max(1, discountPercent)}% OFF</strong>
                <span>Save {formatCurrency(savingsValue)}</span>
                {urgencyLabel ? <span className="card-urgency-pill">{urgencyLabel}</span> : null}
              </div>
            </div>
          ) : (
            <div className="product-price-row">
              <strong><SignedCurrency amount={priceValue} /></strong>
              {offerToneLabel ? <span className="card-inline-offer-chip">{offerToneLabel}</span> : null}
            </div>
          )}

          {!hasDiscount && offerLabel ? (
            <small className="card-offer-note-line">
              {offerLabel}
            </small>
          ) : null}

          {showFromPrice ? (
            <small className="card-from-price">From {formatCurrency(minPrice)}</small>
          ) : null}
        </div>

        <div className="product-footer compact card-footer-stack">
          <div className="product-stock">
            <span className={stockTone}>{stockText}</span>
            <small className="cart-qty-indicator">
              {familyCartQty > 0 ? `Cart ${familyCartQty}` : (urgencyLabel || stockHint)}
            </small>
          </div>

          <div className="card-action-row">
            {selectedQty > 0 ? (
              <div className="card-qty-counter">
                <button
                  type="button"
                  className="qty-step-btn"
                  onClick={() => onDecrease(selectedVariation)}
                  aria-label={`Decrease ${family.name}`}
                >
                  -
                </button>
                <span className="qty-step-value">{selectedQty}</span>
                <button
                  type="button"
                  className="qty-step-btn"
                  onClick={() => onAdd(family, selectedVariation)}
                  aria-label={`Increase ${family.name}`}
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="add-to-cart-btn"
                onClick={() => onAdd(family, selectedVariation)}
              >
                <Plus size={14} />
                {selectedStock === 0 ? stockActionLabel : 'Add'}
              </button>
            )}

            <button
              type="button"
              className="card-view-btn"
              onClick={onOpenDetails}
            >
              {detailLabel}
            </button>
          </div>

          {showSwipeHint ? (
            <span className="quick-add-swipe-hint">{isAddedState ? 'Added' : 'Swipe card to quick add'}</span>
          ) : null}
        </div>

        {detailContent}
      </div>
    </article>
  );
});

export default ProductCard;
