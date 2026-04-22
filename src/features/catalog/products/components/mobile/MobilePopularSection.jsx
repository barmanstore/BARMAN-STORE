const MobilePopularSection = ({ popularFamilies, renderMobileProductCard }) => (
  <section className="mobile-section mobile-popular" id="mobile-popular-section">
    <div className="mobile-section-head">
      <div>
        <h3>Popular Products</h3>
        <p>Best-loved picks right now.</p>
      </div>
    </div>
    {popularFamilies.length === 0 ? (
      <p className="mobile-empty">No products matched this category.</p>
    ) : (
      <div className="mobile-products-grid">
        {popularFamilies.map((family, index) =>
          renderMobileProductCard(family, { prioritizeImage: index < 4 })
        )}
      </div>
    )}
  </section>
);

export default MobilePopularSection;
