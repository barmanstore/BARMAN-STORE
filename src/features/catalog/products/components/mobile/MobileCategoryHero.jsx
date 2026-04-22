const MobileCategoryHero = ({
  selectedCategory,
  mobileSubcategories,
  selectedSubcategory,
  handleMobileSubcategorySelect,
  normalizeText,
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
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      nextIndex = (currentIndex + 1) % tabs.length;
    tabs[nextIndex].focus();
  };

  const isAllSelected = selectedSubcategory === 'all';

  return (
    <section className="mobile-category-hero">
      <div className="mobile-category-title">
        <h2>{selectedCategory === 'all' ? 'Shop By Category' : selectedCategory}</h2>
        <p>
          {selectedCategory === 'all'
            ? 'Pick a category to filter products quickly.'
            : 'Browse subcategories below.'}
        </p>
      </div>
      {mobileSubcategories.length > 0 ? (
        <div className="mobile-subcategory-scroller" role="tablist" aria-label="Subcategories">
          <button
            type="button"
            className={`mobile-subcategory-chip ${isAllSelected ? 'active' : ''}`}
            onClick={() => handleMobileSubcategorySelect('all')}
            role="tab"
            aria-selected={isAllSelected}
            tabIndex={isAllSelected ? 0 : -1}
            onKeyDown={handleTabKeyDown}
          >
            All
          </button>
          {mobileSubcategories.map((subcategory) => {
            const isSelected =
              normalizeText(selectedSubcategory) === normalizeText(subcategory.name);
            return (
              <button
                type="button"
                key={subcategory.id}
                className={`mobile-subcategory-chip ${isSelected ? 'active' : ''}`}
                onClick={() => handleMobileSubcategorySelect(subcategory.name)}
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onKeyDown={handleTabKeyDown}
              >
                {subcategory.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};

export default MobileCategoryHero;
