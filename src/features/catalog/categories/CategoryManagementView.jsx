import { X } from 'lucide-react';
import CategoryDiagramPanel from './components/CategoryDiagramPanel';
import CategoryFormPanel from './components/CategoryFormPanel';
import CategoryProductsPanel from './components/CategoryProductsPanel';
import CategoryToolbar from './components/CategoryToolbar';
import CategoryTreePanel from './components/CategoryTreePanel';
import './CategoryManagement.css';

const CategoryManagementView = ({
  onClose,
  error,
  success,
  activeView,
  onViewChange,
  onRefresh,
  categories,
  categoryTree,
  loading,
  diagram,
  selectedCategoryId,
  selectedCategory,
  formSectionRef,
  nameInputRef,
  isEditing,
  formData,
  formErrors,
  parentOptions,
  onSubmit,
  onChange,
  onReset,
  expandedMap,
  onToggleExpanded,
  onSelectCategory,
  onEditCategory,
  onAddChild,
  onDeleteCategory,
  onDropProduct,
  productsLoading,
  categoryProducts,
  editingProductId,
  editingProductCategoryId,
  editingProductCategoryQuery,
  editingProductCategoryFocusIndex,
  savingProductEdit,
  filteredProductCategoryOptions,
  productCategoryInputRef,
  onStartEditing,
  onCategoryQueryChange,
  onCategoryQueryKeyDown,
  onChooseCategory,
  onHoverCategoryIndex,
  onCancelEditing,
  onSaveEdit,
  onDragStart,
  onDragEnd,
}) => (
  <div className="category-management-overlay">
    <div className="category-management-container fade-in-up">
      <div className="category-management-header">
        <h2>Category Management</h2>
        <button className="close-btn" onClick={onClose}>
          <X size={22} />
        </button>
      </div>

      {error ? <div className="error-message">{error}</div> : null}
      {success ? <div className="success-message">{success}</div> : null}

      <CategoryToolbar
        activeView={activeView}
        onViewChange={onViewChange}
        onRefresh={onRefresh}
      />

      <div className="category-management-content">
        <CategoryFormPanel
          formSectionRef={formSectionRef}
          nameInputRef={nameInputRef}
          isEditing={isEditing}
          formData={formData}
          formErrors={formErrors}
          parentOptions={parentOptions}
          loading={loading}
          onSubmit={onSubmit}
          onChange={onChange}
          onReset={onReset}
        />

        <div className="categories-workspace">
          <div className="categories-list-section">
            <h3>Categories ({categories.length})</h3>
            {loading && !categories.length ? (
              <div className="loading-message">Loading categories...</div>
            ) : categories.length === 0 ? (
              <div className="empty-message">No categories found. Add one to start building your tree.</div>
            ) : activeView === 'tree' ? (
              <CategoryTreePanel
                categoryTree={categoryTree}
                expandedMap={expandedMap}
                selectedCategoryId={selectedCategoryId}
                onToggleExpanded={onToggleExpanded}
                onSelectCategory={onSelectCategory}
                onEditCategory={onEditCategory}
                onAddChild={onAddChild}
                onDeleteCategory={onDeleteCategory}
                onDropProduct={onDropProduct}
              />
            ) : (
              <CategoryDiagramPanel
                diagram={diagram}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={onSelectCategory}
              />
            )}
          </div>

          <CategoryProductsPanel
            selectedCategory={selectedCategory}
            productsLoading={productsLoading}
            categoryProducts={categoryProducts}
            editingProductId={editingProductId}
            editingProductCategoryId={editingProductCategoryId}
            editingProductCategoryQuery={editingProductCategoryQuery}
            editingProductCategoryFocusIndex={editingProductCategoryFocusIndex}
            savingProductEdit={savingProductEdit}
            filteredProductCategoryOptions={filteredProductCategoryOptions}
            productCategoryInputRef={productCategoryInputRef}
            onStartEditing={onStartEditing}
            onCategoryQueryChange={onCategoryQueryChange}
            onCategoryQueryKeyDown={onCategoryQueryKeyDown}
            onChooseCategory={onChooseCategory}
            onHoverCategoryIndex={onHoverCategoryIndex}
            onCancelEditing={onCancelEditing}
            onSaveEdit={onSaveEdit}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        </div>
      </div>
    </div>
  </div>
);

export default CategoryManagementView;
