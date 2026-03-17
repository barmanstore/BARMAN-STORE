const MobileTabsSection = ({
  MOBILE_TAB_OPTIONS,
  activeMobileTab,
  setActiveMobileTab,
  activeTabFamilies,
  renderMobileProductCard,
}) => (
  <section className="mobile-section mobile-tabs">
    <div className="mobile-section-head">
      <div>
        <h3>Discover More</h3>
        <p>Switch tabs to explore.</p>
      </div>
    </div>
    <div className="mobile-tab-row" role="tablist" aria-label="Quick tabs">
      {MOBILE_TAB_OPTIONS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`mobile-tab-btn ${activeMobileTab === tab.key ? 'active' : ''}`}
          onClick={() => setActiveMobileTab(tab.key)}
          aria-pressed={activeMobileTab === tab.key}
        >
          {tab.label}
        </button>
      ))}
    </div>
    {activeTabFamilies.length === 0 ? (
      <p className="mobile-empty">No products available in this tab.</p>
    ) : (
      <div className="mobile-products-grid">
        {activeTabFamilies.map((family, index) => renderMobileProductCard(family, { prioritizeImage: index < 2 }))}
      </div>
    )}
  </section>
);

export default MobileTabsSection;

