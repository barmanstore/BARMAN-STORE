import { Plus } from 'lucide-react';
import SignedCurrency from '../../../../shared/components/SignedCurrency';
import { formatCurrency } from '../../../../shared/utils/formatters';
import SafeProductImage from './SafeProductImage';
import {
  LOW_STOCK_THRESHOLD,
  getFirstAvailableVariation,
  getVariationLabel,
  normalizeText,
} from '../utils/productHelpers.js';

function ProductDetailView({
  family,
  selectedVariationId,
  onSelectVariation,
  onIncreaseQty,
  onDecreaseQty,
  cartQtyById,
  buttonStatus,
  showImage = false
}) {
  const selectedVariation = family.variations.find((v) => v.id === selectedVariationId) || getFirstAvailableVariation(family);
  if (!selectedVariation) return null;
  const hasMultipleVariations = family.variations.length > 1;
  const labelSeen = new Set();
  const variationChoices = family.variations.map((variation, idx) => {
    let label = getVariationLabel(variation, idx);
    const key = normalizeText(label);
    if (labelSeen.has(key)) {
      label = `${label} (${idx + 1})`;
    }
    labelSeen.add(key);
    return { variation, label };
  });

  const selectedQty = Number(cartQtyById[selectedVariation.id] || 0);
  const selectedStock = Number(selectedVariation.stock || 0);
  const isSpecialOrder = selectedStock > 0 && selectedStock <= LOW_STOCK_THRESHOLD;
  const isMaxed = false;
  const canIncreaseQty = true;
  const added = buttonStatus[selectedVariation.id] === 'added';
  const offerLabel = String(
    selectedVariation?.offerLabel
    || selectedVariation?.offerBadges?.[0]
    || selectedVariation?.offerDisplay?.display_offer_label
    || ''
  ).trim();

  return (
    <div className="product-detail-view" onClick={(event) => event.stopPropagation()} role="presentation">
      {showImage && (
        <div className="detail-mobile-image-wrap">
          <SafeProductImage
            src={selectedVariation.image}
            alt={family.name}
            className="detail-mobile-image"
            fallbackProduct={selectedVariation.raw}
          />
        </div>
      )}
      <p className="detail-description">{family.description || 'No additional description available.'}</p>
      {hasMultipleVariations ? (
        <div className="variation-list">
          {variationChoices.map(({ variation, label }) => {
            const isActive = variation.id === selectedVariation.id;
            return (
              <button
                key={variation.id}
                type="button"
                className={`variation-chip ${isActive ? 'active' : ''}`}
                onClick={() => onSelectVariation(family.id, variation.id)}
              >
                <span>{label}</span>
                <strong>{formatCurrency(Number(variation.price || 0))}</strong>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="single-variation-row">
          <span>{variationChoices[0]?.label}</span>
          <strong>{formatCurrency(Number(selectedVariation.price || 0))}</strong>
        </div>
      )}

      <div className="detail-selected-meta">
        <div className="detail-price-line">
          <SignedCurrency amount={Number(selectedVariation.price || 0)} />
          <small>/ {selectedVariation.uom || 'pcs'}</small>
        </div>
        {selectedVariation.mrp && Number(selectedVariation.mrp) > Number(selectedVariation.price) && (
          <small className="mrp-price">MRP: {formatCurrency(selectedVariation.mrp)}</small>
        )}
        {offerLabel ? <small className="mrp-price">{offerLabel}</small> : null}
        <div className="detail-stock-line">
          <span className={selectedStock > 0 ? (isSpecialOrder ? 'special-order' : 'in-stock') : 'out-of-stock'}>
            {selectedStock > 0 ? (isSpecialOrder ? 'Special Order' : 'In stock') : 'Out of stock'}
          </span>
          {isSpecialOrder ? <small>Limited stock. May take longer.</small> : null}
        </div>
      </div>

      <button
        type="button"
        className="add-to-cart-btn detail-add-btn"
        onClick={() => onIncreaseQty(family, selectedVariation)}
        disabled={!canIncreaseQty}
      >
        <Plus size={14} />
        {selectedStock === 0
          ? (added ? 'Requested!' : 'Request item')
          : isMaxed
            ? 'Max in cart'
            : added
              ? 'Added!'
              : 'Add to cart'}
      </button>
      <div className="detail-counter-row">
        <button
          type="button"
          className="qty-step-btn"
          onClick={() => onDecreaseQty(selectedVariation)}
          disabled={selectedQty <= 0}
        >
          -
        </button>
        <span className="qty-step-value">{selectedQty}</span>
        <button
          type="button"
          className="qty-step-btn"
          onClick={() => onIncreaseQty(family, selectedVariation)}
          disabled={!canIncreaseQty}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default ProductDetailView;


