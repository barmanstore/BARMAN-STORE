import { memo } from 'react';
import { Plus } from 'lucide-react';
import { formatCurrency, getSignedCurrencyClassName } from '../../utils/formatters';

const formatCurrencyColored = (amount) => {
  const formatted = formatCurrency(Math.abs(amount));
  return <span className={getSignedCurrencyClassName(amount)}>{formatted}</span>;
};

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

          <div className="product-price-row">
            <strong>{formatCurrencyColored(priceValue)}</strong>
            {hasDiscount ? (
              <span className="product-price-mrp">{formatCurrency(mrpValue)}</span>
            ) : null}
          </div>

          {hasDiscount ? (
            <small className="save-price">Save {formatCurrency(savingsValue)}</small>
          ) : null}

          {showFromPrice ? (
            <small className="card-from-price">From {formatCurrency(minPrice)}</small>
          ) : null}
        </div>

        <div className="product-footer compact card-footer-stack">
          <div className="product-stock">
            <span className={stockTone}>{stockText}</span>
            <small className="cart-qty-indicator">
              {familyCartQty > 0 ? `Cart ${familyCartQty}` : stockHint}
            </small>
          </div>

          <div className="card-action-row">
            <button
              type="button"
              className="card-view-btn"
              onClick={onOpenDetails}
            >
              {detailLabel}
            </button>

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
