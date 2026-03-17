const ProductsEmptyState = ({
  show,
  setSelectedCategory,
  commitSearchQuery,
  setSortBy,
  setGroupBy,
  setInStockOnly,
  DEFAULT_SORT_BY,
  GROUP_BY_OPTIONS,
}) => {
  if (!show) return null;

  return (
    <div className="no-products">
      <p>No products matched your filters.</p>
      <button
        type="button"
        className="reset-filters-btn"
        onClick={() => {
          setSelectedCategory('all');
          commitSearchQuery('');
          setSortBy(DEFAULT_SORT_BY);
          setGroupBy(GROUP_BY_OPTIONS.category);
          setInStockOnly(false);
        }}
      >
        Reset Filters
      </button>
    </div>
  );
};

export default ProductsEmptyState;

