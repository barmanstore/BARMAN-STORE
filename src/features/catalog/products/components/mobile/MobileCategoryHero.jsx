const MobileCategoryHero = ({
  selectedCategory,
  mobileSubcategories,
  selectedSubcategory,
  handleMobileSubcategorySelect,
  normalizeText,
}) => (
  <section className="mobile-category-hero">
    <div className="mobile-category-title">
      <h2>{selectedCategory === 'all' ? 'Shop By Category' : selectedCategory}</h2>
      <p>{selectedCategory === 'all' ? 'Pick a category to filter products quickly.' : 'Browse subcategories below.'}</p>
    </div>
    {mobileSubcategories.length > 0 ? (
      <div className="mobile-subcategory-scroller" role="tablist" aria-label="Subcategories">
        <button
          type="button"
          className={`mobile-subcategory-chip ${selectedSubcategory === 'all' ? 'active' : ''}`}
          onClick={() => handleMobileSubcategorySelect('all')}
          aria-pressed={selectedSubcategory === 'all'}
        >
          All
        </button>
        {mobileSubcategories.map((subcategory) => (
          <button
            type="button"
            key={subcategory.id}
            className={`mobile-subcategory-chip ${normalizeText(selectedSubcategory) === normalizeText(subcategory.name) ? 'active' : ''}`}
            onClick={() => handleMobileSubcategorySelect(subcategory.name)}
            aria-pressed={normalizeText(selectedSubcategory) === normalizeText(subcategory.name)}
          >
            {subcategory.name}
          </button>
        ))}
      </div>
    ) : null}
  </section>
);

export default MobileCategoryHero;

