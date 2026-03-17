import SafeProductImage from '../SafeProductImage';

const MobileRestockSection = ({ smartRestockItems, handleRestockAll, addToCart }) => (
  <section className="mobile-section mobile-restock">
    <div className="mobile-section-head">
      <div>
        <h3>Smart Restock</h3>
        <p>Frequently bought items due soon.</p>
      </div>
      <button
        type="button"
        className="mobile-action-btn"
        onClick={handleRestockAll}
        disabled={smartRestockItems.length === 0}
      >
        Restock All
      </button>
    </div>
    {smartRestockItems.length === 0 ? (
      <p className="mobile-empty">Add items to unlock restock prediction.</p>
    ) : (
      <div className="mobile-restock-row horizontal-group-row">
        {smartRestockItems.map((item) => (
          <article key={`restock-mobile-${item.id}`} className={`mobile-restock-card ${item.tone}`}>
            <div className="mobile-restock-top">
              <div className="mobile-restock-media" aria-hidden="true">
                <SafeProductImage
                  src={item.variation?.image}
                  alt=""
                  className="mobile-restock-media-img"
                  loading="lazy"
                  fallbackProduct={item.variation?.raw}
                  width={54}
                  height={54}
                />
              </div>
              <div className="mobile-restock-copy">
                <strong>{item.family.name}</strong>
                <span>{item.depletionPercent}% low</span>
              </div>
            </div>
            <div className={`restock-progress ${item.tone}`}>
              <span style={{ width: `${item.depletionPercent}%` }} />
            </div>
            <button type="button" onClick={() => addToCart(item.family, item.variation)}>+ Add</button>
          </article>
        ))}
      </div>
    )}
  </section>
);

export default MobileRestockSection;

