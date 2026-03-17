const ProductsCategoryStrip = ({
  activeFilterOptions,
  selectedCategory,
  groupBy,
  setSelectedCategory,
  renderCategoryChipLabel,
  normalizeText,
  GROUP_BY_OPTIONS,
}) => (
  <div className="products-category-strip sticky-category-strip">
    <button
      type="button"
      className={`category-btn ${groupBy === GROUP_BY_OPTIONS.brand ? 'brand-filter-btn' : ''} ${selectedCategory === 'all' ? 'active' : ''}`}
      onClick={() => setSelectedCategory('all')}
    >
      {renderCategoryChipLabel(
        { name: 'All', icon: 'ðŸ›’', image: '' },
        groupBy === GROUP_BY_OPTIONS.brand ? 'brand' : 'category'
      )}
    </button>
    {activeFilterOptions.map((category) => (
      <button
        type="button"
        key={category.id}
        className={`category-btn ${groupBy === GROUP_BY_OPTIONS.brand ? 'brand-filter-btn' : ''} ${normalizeText(selectedCategory) === normalizeText(category.name) ? 'active' : ''}`}
        onClick={() => setSelectedCategory(category.name)}
        aria-label={category.name}
      >
        {renderCategoryChipLabel(category, groupBy === GROUP_BY_OPTIONS.brand ? 'brand' : 'category')}
      </button>
    ))}
  </div>
);

export default ProductsCategoryStrip;

