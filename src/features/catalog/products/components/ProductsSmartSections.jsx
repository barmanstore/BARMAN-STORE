import { RotateCcw, Sparkles } from 'lucide-react';
import { formatCurrency } from '../../../../shared/utils/formatters';
import SafeProductImage from './SafeProductImage';

function ProductsSmartSections({
  repeatOrderFamilies,
  recentlyBoughtFamilies,
  handleRepeatOrder,
  getSelectedVariation,
  getFamilyPreviewVariation,
  smartRestockItems,
  handleRestockAll,
  addToCart,
  quickAddFamilies,
  renderQuickAddTile,
  comboSuggestions,
  handleAddCombo,
}) {
  return (
    <section className="products-secondary-sections">
      <header className="products-secondary-section-title">
        <h2>Smart Picks For You</h2>
        <p>Reorder faster with personalized shortcuts.</p>
      </header>

      {repeatOrderFamilies.length > 0 && (
        <section className="products-feature-block repeat-order-block">
          <div className="feature-block-header">
            <h2><RotateCcw size={16} /> 1-Tap Repeat Order</h2>
            <button type="button" className="feature-action-btn" onClick={handleRepeatOrder}>
              Repeat Order
            </button>
          </div>
          <small className="repeat-order-caption">
            {recentlyBoughtFamilies.length > 0 ? 'From your recently bought products' : 'From your quick-add history'}
          </small>
          <div className="repeat-order-grid horizontal-group-row">
            {repeatOrderFamilies.map((family) => {
              const selectedVariation = getSelectedVariation(family);
              const previewVariation = getFamilyPreviewVariation(family, selectedVariation);
              return (
                <article key={`repeat-${family.id}`} className="repeat-order-item">
                  <div className="repeat-order-thumb" aria-hidden="true">
                    <SafeProductImage
                      src={previewVariation?.image}
                      alt=""
                      className="repeat-order-thumb-img"
                      loading="lazy"
                      fallbackProduct={previewVariation?.raw || selectedVariation?.raw}
                      width={42}
                      height={42}
                    />
                  </div>
                  <span className="repeat-order-name">{family.name}</span>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="products-feature-block restock-block">
        <div className="feature-block-header">
          <h2><Sparkles size={16} /> Smart Restock</h2>
          <button
            type="button"
            className="feature-action-btn"
            onClick={handleRestockAll}
            disabled={smartRestockItems.length === 0}
          >
            Restock All
          </button>
        </div>
        {smartRestockItems.length === 0 ? (
          <p className="feature-empty">
            Add a few items to unlock restock prediction.
          </p>
        ) : (
          <div className="restock-list horizontal-group-row">
            {smartRestockItems.map((item) => (
              <article key={item.id} className="restock-item">
                <div className="restock-item-top">
                  <div className="restock-item-media" aria-hidden="true">
                    <SafeProductImage
                      src={item.variation?.image}
                      alt=""
                      className="restock-item-media-img"
                      loading="lazy"
                      fallbackProduct={item.variation?.raw}
                      width={46}
                      height={46}
                    />
                  </div>
                  <div className="restock-item-head">
                    <strong>{item.family.name}</strong>
                    <span>{item.depletionPercent}% low</span>
                  </div>
                </div>
                <div className={`restock-progress ${item.tone}`}>
                  <span style={{ width: `${item.depletionPercent}%` }} />
                </div>
                <div className="restock-item-footer">
                  <small>{item.daysSince}d ago</small>
                  <button type="button" onClick={() => addToCart(item.family, item.variation)}>+ Restock</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {quickAddFamilies.length > 0 && (
        <section className="products-feature-block quick-add-block">
          <div className="feature-block-header">
            <h2>Quick Add</h2>
            <small>Swipe or tap to add</small>
          </div>
          <div className="quick-add-grid horizontal-group-row">
            {quickAddFamilies.map((family) => renderQuickAddTile(family))}
          </div>
        </section>
      )}

      {comboSuggestions.length > 0 && (
        <section className="products-feature-block combo-block">
          <div className="feature-block-header">
            <h2>Combo Deals</h2>
          </div>
          <div className="combo-list horizontal-group-row">
            {comboSuggestions.map((combo) => (
              <article key={combo.id} className="combo-card">
                <h3>{combo.title}</h3>
                <p>{combo.subtitle}</p>
                <div className="combo-price-row">
                  <strong>{formatCurrency(combo.finalPrice)}</strong>
                  <span>Save {formatCurrency(combo.saveAmount)}</span>
                </div>
                <button type="button" onClick={() => handleAddCombo(combo)}>Add Combo</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export default ProductsSmartSections;

