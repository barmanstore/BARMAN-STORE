import SafeProductImage from '../SafeProductImage';

const MobileRepeatOrderSection = ({
  repeatOrderFamilies,
  recentlyBoughtFamilies,
  handleRepeatOrder,
  openFamilyDetails,
  getSelectedVariation,
  getFamilyPreviewVariation,
}) => (
  <section className="mobile-section mobile-repeat-order">
    <div className="mobile-section-head">
      <div>
        <h3>One-tap Repeat Order</h3>
        <p>{recentlyBoughtFamilies.length > 0 ? 'From your recent items.' : 'Quick add from your history.'}</p>
      </div>
      <button
        type="button"
        className="mobile-action-btn"
        onClick={handleRepeatOrder}
        disabled={repeatOrderFamilies.length === 0}
      >
        Add All
      </button>
    </div>
    {repeatOrderFamilies.length === 0 ? (
      <p className="mobile-empty">No repeat items yet.</p>
    ) : (
      <div className="mobile-repeat-row horizontal-group-row">
        {repeatOrderFamilies.map((family) => {
          const selectedVariation = getSelectedVariation(family);
          const previewVariation = getFamilyPreviewVariation(family, selectedVariation);
          return (
            <button
              key={`repeat-mobile-${family.id}`}
              type="button"
              className="mobile-repeat-item"
              onClick={() => openFamilyDetails(family.id)}
            >
              <span className="mobile-repeat-thumb" aria-hidden="true">
                <SafeProductImage
                  src={previewVariation?.image}
                  alt=""
                  className="mobile-repeat-thumb-img"
                  loading="lazy"
                  fallbackProduct={previewVariation?.raw || selectedVariation?.raw}
                  width={46}
                  height={46}
                />
              </span>
              <span className="mobile-repeat-name">{family.name}</span>
            </button>
          );
        })}
      </div>
    )}
  </section>
);

export default MobileRepeatOrderSection;

