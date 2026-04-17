import SafeProductImage from '../SafeProductImage';

const MobileRepeatOrderSection = ({
  repeatOrderFamilies,
  handleRepeatOrder,
  openFamilyDetails,
  getSelectedVariation,
  getFamilyPreviewVariation,
}) => {
  const calculateDaysAgo = (date) => {
    const now = new Date();
    const orderDate = new Date(date);
    const diffTime = Math.abs(now - orderDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
  <section className="mobile-section mobile-repeat-order">
    <div className="mobile-section-head">
      <div>
        <h3>Your Usuals</h3>
        <p>Smart suggestions based on your ordering habits.</p>
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
                  {!selectedVariation?.in_stock && (
                    <span className="mobile-repeat-unavailable">Unavailable</span>
                  )}
                </span>
                <span className="mobile-repeat-name">{family.name}</span>
                {family.lastOrderedAt && (
                  <span className="mobile-repeat-last-bought">Last bought: {calculateDaysAgo(family.lastOrderedAt)} days ago</span>
                )}
            </button>
          );
        })}
      </div>
    )}
  </section>
  );
};

export default MobileRepeatOrderSection;

