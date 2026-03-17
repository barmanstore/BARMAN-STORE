const MobileQuickAddSection = ({ quickAddFamilies, renderMobileProductCard }) => (
  <section className="mobile-section mobile-quick-add">
    <div className="mobile-section-head">
      <div>
        <h3>Quick Add Essentials</h3>
        <p>Tap add for everyday items.</p>
      </div>
    </div>
    {quickAddFamilies.length === 0 ? (
      <p className="mobile-empty">No essentials found yet.</p>
    ) : (
      <div className="mobile-quick-add-row horizontal-group-row">
        {quickAddFamilies.map((family) => renderMobileProductCard(family))}
      </div>
    )}
  </section>
);

export default MobileQuickAddSection;

