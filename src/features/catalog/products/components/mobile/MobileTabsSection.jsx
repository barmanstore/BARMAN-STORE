const MobileTabsSection = ({
  MOBILE_TAB_OPTIONS,
  activeMobileTab,
  setActiveMobileTab,
  activeTabFamilies,
  renderMobileProductCard,
}) => {
  // WAI-ARIA roving tabindex for tabs.
  const handleTabKeyDown = (event) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]');
    if (!tabs || tabs.length === 0) return;
    const currentIndex = Array.from(tabs).indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    let nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
    tabs[nextIndex].focus();
  };

  return (
    <section className="mobile-section mobile-tabs">
      <div className="mobile-section-head">
        <div>
          <h3>Discover More</h3>
          <p>Switch tabs to explore.</p>
        </div>
      </div>
      <div className="mobile-tab-row" role="tablist" aria-label="Quick tabs">
        {MOBILE_TAB_OPTIONS.map((tab) => {
          const isSelected = activeMobileTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`mobile-tab-btn ${isSelected ? 'active' : ''}`}
              onClick={() => setActiveMobileTab(tab.key)}
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={handleTabKeyDown}
            >
              {tab.label}
            </button>
          );
        })}
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
};

export default MobileTabsSection;
