import { Filter, SlidersHorizontal } from 'lucide-react';
import MobileBottomSheet from '../../../../../shared/components/mobile/MobileBottomSheet';

const ProductsMobileFilterSheet = ({
  showMobileFilters,
  setShowMobileFilters,
  groupBy,
  setGroupBy,
  sortBy,
  setSortBy,
  activeFilterOptions,
  selectedCategory,
  setSelectedCategory,
  renderCategoryChipLabel,
  normalizeText,
  GROUP_BY_OPTIONS,
}) => (
  <MobileBottomSheet
    open={showMobileFilters}
    onClose={() => setShowMobileFilters(false)}
    title="Filter Products"
    className="products-filter-sheet"
  >
    <div className="filter-row">
      <div className="filter-header">
        <Filter size={18} />
        <span>{groupBy === GROUP_BY_OPTIONS.brand ? 'Brand' : 'Category'}</span>
      </div>
      <div className="category-buttons">
        <button
          type="button"
          className={`category-btn ${groupBy === GROUP_BY_OPTIONS.brand ? 'brand-filter-btn' : ''} ${selectedCategory === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCategory('all')}
        >
          {renderCategoryChipLabel(
            { name: 'All', icon: '🛒', image: '' },
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
    </div>

    <div className="sort-row">
      <div className="sort-group">
        <Filter size={16} />
        <select
          id="products-group-by-mobile"
          name="group_by"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value)}
          aria-label="Group products"
        >
          <option value={GROUP_BY_OPTIONS.category}>Group: Category {'->'} Sub-category</option>
          <option value={GROUP_BY_OPTIONS.brand}>Group: Brand {'->'} Sub-brand</option>
        </select>
      </div>
    </div>

    <div className="sort-row">
      <div className="sort-group">
        <SlidersHorizontal size={16} />
        <select
          id="products-sort-by-mobile"
          name="sort_by"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value)}
          aria-label="Sort products"
        >
          <option value="popular">Popular for you</option>
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="discount-desc">Discount: High to Low</option>
          <option value="stock-desc">Stock: High to Low</option>
        </select>
      </div>
    </div>
  </MobileBottomSheet>
);

export default ProductsMobileFilterSheet;


