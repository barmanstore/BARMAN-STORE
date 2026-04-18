import {
  CheckCircle2,
  Command,
  Download,
  Edit,
  Eraser,
  FolderOpen,
  ListChecks,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminPageHeader from '../components/AdminPageHeader';
import CommandPalette from '../components/CommandPalette';
import ProductsGridPanel from './products/ProductsGridPanel';
import ProductsImportCard from './products/ProductsImportCard';
import ProductsTablePanel from './products/ProductsTablePanel';

const createBulkEditForm = () => ({
  category: '',
  price: '',
  stock: '',
  status: '',
});

const getNormalizedProductId = (value) => Number(value) || 0;

const BULK_JOB_FINAL_STATES = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

const getBulkJobTitle = (job = {}) => {
  const status = String(job?.status || '')
    .trim()
    .toLowerCase();
  if (status === 'queued') return 'Queued';
  if (status === 'running') return 'Running';
  if (status === 'cancel_requested') return 'Cancelling';
  if (status === 'completed') return 'Completed';
  if (status === 'completed_with_errors') return 'Completed with errors';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'failed') return 'Failed';
  return 'Bulk job';
};

const ProductsSelectionBar = ({
  selectedCount,
  visibleProducts,
  selectedVisibleProduct,
  selectedVisibleCount,
  hasBulkChanges,
  bulkEditForm,
  bulkSaving,
  onBulkEditChange,
  onBulkSubmit,
  onSelectVisible,
  onClearSelection,
  tableEditId,
  handleTableEditSave,
  tableEditSaving,
  cancelTableEdit,
  openTableEdit,
  handleEditProduct,
  productEditLoadingId,
  handleDeleteProduct,
  handlePermanentDeleteProduct,
}) => {
  if (selectedCount <= 0) return null;
  const isSingleSelection = selectedCount === 1 && Boolean(selectedVisibleProduct);
  const selectVisibleDisabled =
    visibleProducts.length === 0 || selectedVisibleCount === visibleProducts.length;

  return (
    <div className="products-bulk-action-bar">
      <div className="products-bulk-summary-row">
        <div className="products-bulk-summary-copy">
          <span className="products-bulk-summary-pill">{selectedCount} selected</span>
          <span className="products-bulk-summary-text">
            {isSingleSelection
              ? `Selected ${selectedVisibleProduct.name || 'product'}`
              : 'Leave fields blank to keep existing values.'}
          </span>
        </div>
        <div className="products-bulk-summary-actions">
          <button
            type="button"
            className="products-bulk-link-btn"
            onClick={onSelectVisible}
            disabled={selectVisibleDisabled}
          >
            Select visible
          </button>
          <button type="button" className="products-bulk-link-btn" onClick={onClearSelection}>
            Clear
          </button>
        </div>
      </div>

      {isSingleSelection ? (
        <div className="products-selected-actions">
          <div className="products-selected-meta">
            Selected:{' '}
            <strong title={selectedVisibleProduct.name || '-'}>
              {selectedVisibleProduct.name || '-'}
            </strong>
          </div>
          <div className="products-selected-buttons">
            {tableEditId === selectedVisibleProduct.id ? (
              <>
                <button
                  type="button"
                  className="action-btn edit"
                  onClick={() => handleTableEditSave(selectedVisibleProduct)}
                  disabled={tableEditSaving}
                >
                  {tableEditSaving ? '...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="action-btn delete"
                  onClick={cancelTableEdit}
                  disabled={tableEditSaving}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="action-btn edit"
                  onClick={() => openTableEdit(selectedVisibleProduct)}
                  title="Inline edit"
                >
                  <Edit size={16} />
                </button>
                <button
                  type="button"
                  className="action-btn edit"
                  onClick={() => handleEditProduct(selectedVisibleProduct)}
                  title={
                    Number(productEditLoadingId || 0) === Number(selectedVisibleProduct.id || 0)
                      ? 'Loading full product details...'
                      : 'Advanced edit'
                  }
                  disabled={
                    Number(productEditLoadingId || 0) === Number(selectedVisibleProduct.id || 0)
                  }
                >
                  <FolderOpen size={16} />
                </button>
                <button
                  type="button"
                  className="action-btn delete"
                  onClick={() => handleDeleteProduct(selectedVisibleProduct.id)}
                >
                  <Trash2 size={16} />
                </button>
                {Number(selectedVisibleProduct.is_active ?? 1) === 0 ? (
                  <button
                    type="button"
                    className="action-btn delete"
                    title="Permanent delete"
                    onClick={() => handlePermanentDeleteProduct(selectedVisibleProduct)}
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : (
        <form className="products-bulk-form" onSubmit={onBulkSubmit}>
          <label className="products-bulk-field">
            <span className="products-bulk-field-label">Category</span>
            <input
              type="text"
              className="products-bulk-field-input"
              placeholder="Leave unchanged"
              value={bulkEditForm.category}
              onChange={(e) => onBulkEditChange('category', e.target.value)}
            />
          </label>
          <label className="products-bulk-field">
            <span className="products-bulk-field-label">Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="products-bulk-field-input"
              placeholder="Leave unchanged"
              value={bulkEditForm.price}
              onChange={(e) => onBulkEditChange('price', e.target.value)}
            />
          </label>
          <label className="products-bulk-field">
            <span className="products-bulk-field-label">Stock</span>
            <input
              type="number"
              min="0"
              step="1"
              className="products-bulk-field-input"
              placeholder="Leave unchanged"
              value={bulkEditForm.stock}
              onChange={(e) => onBulkEditChange('stock', e.target.value)}
            />
          </label>
          <label className="products-bulk-field">
            <span className="products-bulk-field-label">Status</span>
            <select
              className="products-bulk-field-input"
              value={bulkEditForm.status}
              onChange={(e) => onBulkEditChange('status', e.target.value)}
            >
              <option value="">Keep status</option>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </label>
          <div className="products-bulk-submit-wrap">
            <button
              type="submit"
              className="admin-btn primary products-bulk-submit"
              disabled={!hasBulkChanges || bulkSaving}
            >
              {bulkSaving ? 'Applying...' : `Apply to ${selectedCount} selected`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const ProductsBulkJobStrip = ({ bulkJob, onCancel, onRetry, onDismiss }) => {
  if (!bulkJob) return null;
  const status = String(bulkJob.status || '')
    .trim()
    .toLowerCase();
  const total = Number(bulkJob.total || 0);
  const succeeded = Number(bulkJob.succeeded || 0);
  const failed = Number(bulkJob.failed || 0);
  const skipped = Number(bulkJob.skipped || 0);
  const conflicts = Number(bulkJob.conflicts || 0);
  const operation = String(bulkJob.operation || '')
    .trim()
    .toLowerCase();
  const summary =
    bulkJob.result_summary && typeof bulkJob.result_summary === 'object'
      ? bulkJob.result_summary
      : {};
  const created = Number(summary.created || 0);
  const updated = Number(summary.updated || 0);
  const isFinal = BULK_JOB_FINAL_STATES.has(status);
  const isError = status === 'completed_with_errors' || status === 'failed';

  return (
    <div
      className={`products-bulk-job-strip ${isError ? 'is-error' : ''} ${isFinal ? 'is-final' : ''}`}
    >
      <div className="products-bulk-job-copy">
        <span className="products-bulk-job-title">{getBulkJobTitle(bulkJob)}</span>
        <span className="products-bulk-job-meta">
          {total} items · {succeeded} succeeded
          {operation === 'import_products' && (created || updated)
            ? ` · ${created} created · ${updated} updated`
            : ''}
          · {failed} failed · {conflicts} conflicted{skipped > 0 ? ` · ${skipped} skipped` : ''}
        </span>
      </div>
      <div className="products-bulk-job-actions">
        {status === 'queued' || status === 'running' || status === 'cancel_requested' ? (
          <button type="button" className="products-bulk-job-btn" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        {status === 'completed_with_errors' ? (
          <button type="button" className="products-bulk-job-btn primary" onClick={onRetry}>
            Retry failed
          </button>
        ) : null}
        <button type="button" className="products-bulk-job-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
};

function ProductsSection({
  isMobile,
  handleAddProduct,
  setShowExportDialog,
  importBusy,
  handleStartImport,
  handleConfirmImport,
  bulkJob,
  handleCancelBulkJob,
  handleRetryFailedBulkJob,
  dismissBulkJob,
  showProductsImportCard,
  importPreviewData,
  importFile,
  importAllowIdenticalRows,
  setImportAllowIdenticalRows,
  effectiveProductViewMode,
  setProductViewMode,
  importFileInputRef,
  handleFileSelected,
  productTableSearch,
  setProductTableSearch,
  visibleProducts,
  productTableSortField,
  productTableSortDir,
  productsPage,
  setProductsPage,
  productsTotal,
  productsLoading,
  productTableCategoryFilter,
  setProductTableCategoryFilter,
  productCategories,
  productColumnPickerRef,
  productTableVisibleColumns,
  productTableAllColumnsSelected,
  toggleSelectAllProductTableColumns,
  isProductTableColumnVisible,
  toggleProductTableColumn,
  productTableStatusFilter,
  setProductTableStatusFilter,
  productTableLowStockOnly,
  setProductTableLowStockOnly,
  selectedVisibleProduct,
  tableEditId,
  handleTableEditSave,
  tableEditSaving,
  cancelTableEdit,
  openTableEdit,
  handleEditProduct,
  productEditLoadingId,
  handleDeleteProduct,
  handlePermanentDeleteProduct,
  handleBulkProductUpdate,
  handleUndoTableAction,
  productTableCalculatedMinWidth,
  toggleProductTableSort,
  getSortIndicator,
  tableEditForm,
  handleTableCellClick,
  setTableEditFieldRef,
  handleTableEditChange,
  handleTableEditKeyDown,
  setSelectedProductId,
  selectedProductId,
  showQuickAdd,
  setShowQuickAdd,
  quickAddForm,
  setQuickAddForm,
  resetQuickAdd,
  quickSaving,
  handleQuickAddSave,
  quickEditId,
  quickEditForm,
  setQuickEditForm,
  cancelQuickEdit,
  handleQuickEditSave,
  startQuickEdit,
  getProductImageSrc,
  getProductFallbackImage,
  getCategoryPath,
  getBrandPath,
}) {
  const pageSize = 100;
  const totalPages = Math.max(1, Math.ceil(Math.max(0, Number(productsTotal || 0)) / pageSize));
  const canPrev = Number(productsPage || 1) > 1;
  const canNext = Number(productsPage || 1) < totalPages;
  const [productTableSearchDraft, setProductTableSearchDraft] = useState(productTableSearch);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [bulkEditForm, setBulkEditForm] = useState(createBulkEditForm);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [tableUndoAction, setTableUndoAction] = useState(null);
  const [tableUndoSaving, setTableUndoSaving] = useState(false);
  const [selectionAnchorProductId, setSelectionAnchorProductId] = useState(0);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');

  const selectedProductIdSet = useMemo(
    () => new Set(selectedProductIds.map((id) => getNormalizedProductId(id)).filter(Boolean)),
    [selectedProductIds]
  );
  const selectedCount = selectedProductIdSet.size;
  const selectedVisibleCount = useMemo(
    () =>
      visibleProducts.reduce(
        (count, product) =>
          count + (selectedProductIdSet.has(getNormalizedProductId(product.id)) ? 1 : 0),
        0
      ),
    [visibleProducts, selectedProductIdSet]
  );
  const selectedSectionProduct = useMemo(() => {
    if (selectedCount !== 1) return null;
    return (
      visibleProducts.find((product) =>
        selectedProductIdSet.has(getNormalizedProductId(product.id))
      ) ||
      selectedVisibleProduct ||
      null
    );
  }, [selectedCount, selectedProductIdSet, selectedVisibleProduct, visibleProducts]);
  const hasBulkChanges = useMemo(
    () =>
      Boolean(
        String(bulkEditForm.category || '').trim() ||
        String(bulkEditForm.price || '').trim() ||
        String(bulkEditForm.stock || '').trim() ||
        String(bulkEditForm.status || '').trim()
      ),
    [bulkEditForm]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setProductTableSearchDraft(productTableSearch);
  }, [productTableSearch]);

  useEffect(() => {
    const draft = String(productTableSearchDraft || '');
    const applied = String(productTableSearch || '');
    if (draft === applied) return undefined;
    if (typeof window === 'undefined') return undefined;
    const timer = window.setTimeout(() => {
      setProductTableSearch(draft);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [productTableSearchDraft, productTableSearch, setProductTableSearch]);

  const clearBulkSelection = useCallback(() => {
    setSelectedProductIds([]);
    setBulkEditForm(createBulkEditForm());
    setSelectedProductId(0);
    setSelectionAnchorProductId(0);
  }, [setSelectedProductId]);

  const toggleProductSelection = useCallback(
    (productId, options = {}) => {
      const id = getNormalizedProductId(productId);
      if (!id) return;
      const shiftKey = Boolean(options?.shiftKey);
      if (shiftKey && selectionAnchorProductId) {
        const anchorIndex = visibleProducts.findIndex(
          (product) => getNormalizedProductId(product.id) === selectionAnchorProductId
        );
        const targetIndex = visibleProducts.findIndex(
          (product) => getNormalizedProductId(product.id) === id
        );
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [fromIndex, toIndex] =
            anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          const rangeIds = visibleProducts
            .slice(fromIndex, toIndex + 1)
            .map((product) => getNormalizedProductId(product.id))
            .filter(Boolean);
          setSelectedProductIds((current) => Array.from(new Set([...current, ...rangeIds])));
          setSelectedProductId(id);
          setSelectionAnchorProductId(id);
          return;
        }
      }
      setSelectedProductIds((current) => {
        const next = current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id];
        return next;
      });
      setSelectedProductId(id);
      setSelectionAnchorProductId(id);
    },
    [selectionAnchorProductId, setSelectedProductId, visibleProducts]
  );

  const selectVisibleProducts = useCallback(() => {
    if (visibleProducts.length === 0) return;
    setSelectedProductIds((current) => {
      const next = new Set(current.map((id) => getNormalizedProductId(id)).filter(Boolean));
      visibleProducts.forEach((product) => {
        const id = getNormalizedProductId(product.id);
        if (id) {
          next.add(id);
        }
      });
      return Array.from(next);
    });
  }, [visibleProducts]);

  const handleBulkEditChange = useCallback((field, value) => {
    setBulkEditForm((current) => ({ ...current, [field]: value }));
  }, []);

  const handleTableEditSaveWithUndo = useCallback(
    async (product) => {
      const snapshot = product && typeof product === 'object' ? { ...product } : null;
      const success = await handleTableEditSave(product);
      if (success && snapshot) {
        setTableUndoAction({
          kind: 'edit',
          snapshot,
          productName: String(snapshot.name || 'product').trim() || 'product',
          undoLabel: 'Undo edit',
        });
      }
      return success;
    },
    [handleTableEditSave]
  );

  const handleDeleteProductWithUndo = useCallback(
    async (productId) => {
      const snapshot =
        selectedSectionProduct && Number(selectedSectionProduct.id || 0) === Number(productId || 0)
          ? { ...selectedSectionProduct }
          : visibleProducts.find((product) => Number(product.id || 0) === Number(productId || 0)) ||
            null;
      const success = await handleDeleteProduct(productId);
      if (success && snapshot) {
        setTableUndoAction({
          kind: 'delete',
          snapshot,
          productName: String(snapshot.name || 'product').trim() || 'product',
          undoLabel: 'Undo delete',
        });
      }
      return success;
    },
    [handleDeleteProduct, selectedSectionProduct, visibleProducts]
  );

  const handlePermanentDeleteProductWithUndo = useCallback(
    async (product) => {
      const snapshot = product && typeof product === 'object' ? { ...product } : null;
      const success = await handlePermanentDeleteProduct(product);
      if (success && snapshot) {
        setTableUndoAction({
          kind: 'permanent_delete',
          snapshot,
          productName: String(snapshot.name || 'product').trim() || 'product',
          undoLabel: 'Restore product',
        });
      }
      return success;
    },
    [handlePermanentDeleteProduct]
  );

  const handleUndoLastTableAction = useCallback(async () => {
    if (!tableUndoAction) return;
    setTableUndoSaving(true);
    try {
      const result = await handleUndoTableAction(tableUndoAction);
      if (result?.success) {
        setTableUndoAction(null);
      }
    } finally {
      setTableUndoSaving(false);
    }
  }, [handleUndoTableAction, tableUndoAction]);

  const focusProductSearch = useCallback(() => {
    if (typeof document === 'undefined') return;
    const node = document.getElementById('products-search');
    if (!node) return;
    node.focus();
    if (typeof node.select === 'function') {
      node.select();
    }
  }, []);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteQuery('');
    setCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, []);

  const commandPaletteActions = useMemo(() => {
    const selectedIds = Array.from(selectedProductIdSet);
    const selectedVisible = selectedVisibleProduct || null;
    const canBulkDeactivate = selectedCount > 0;

    return [
      {
        id: 'focus-search',
        label: 'Focus product search',
        description: 'Jump to the product search box.',
        shortcut: 'Search',
        icon: <Search size={16} />,
        keywords: ['search', 'filter', 'find'],
        onSelect: () => {
          closeCommandPalette();
          window.requestAnimationFrame(() => focusProductSearch());
        },
      },
      {
        id: 'add-product',
        label: 'Add product',
        description: 'Open the full product form.',
        shortcut: 'Add',
        icon: <Plus size={16} />,
        keywords: ['create', 'new', 'product'],
        onSelect: () => {
          closeCommandPalette();
          handleAddProduct();
        },
      },
      {
        id: 'select-visible',
        label: 'Select visible rows',
        description: 'Select every row currently visible in the table.',
        shortcut: 'Bulk',
        icon: <ListChecks size={16} />,
        keywords: ['select', 'visible', 'rows', 'bulk'],
        disabled: visibleProducts.length === 0 || selectedVisibleCount === visibleProducts.length,
        onSelect: () => {
          closeCommandPalette();
          selectVisibleProducts();
        },
      },
      {
        id: 'clear-selection',
        label: 'Clear selection',
        description: 'Remove all selected rows.',
        shortcut: 'Clear',
        icon: <Eraser size={16} />,
        keywords: ['clear', 'deselect', 'selection'],
        disabled: selectedCount === 0,
        onSelect: () => {
          closeCommandPalette();
          clearBulkSelection();
        },
      },
      {
        id: 'inline-edit',
        label: 'Inline edit selected',
        description: 'Edit the selected product in the table row.',
        shortcut: 'Edit',
        icon: <Edit size={16} />,
        keywords: ['edit', 'inline', 'row'],
        disabled: !selectedVisible || selectedCount !== 1,
        onSelect: () => {
          closeCommandPalette();
          openTableEdit(selectedVisible);
        },
      },
      {
        id: 'advanced-edit',
        label: 'Advanced edit selected',
        description: 'Open the full product form for the selected product.',
        shortcut: 'Open',
        icon: <FolderOpen size={16} />,
        keywords: ['advanced', 'edit', 'form', 'full'],
        disabled: !selectedVisible || selectedCount !== 1,
        onSelect: () => {
          closeCommandPalette();
          handleEditProduct(selectedVisible);
        },
      },
      {
        id: 'save-inline-edit',
        label: 'Save inline edit',
        description: 'Commit the active inline row edit.',
        shortcut: 'Save',
        icon: <CheckCircle2 size={16} />,
        keywords: ['save', 'commit', 'row'],
        disabled: !selectedVisible || Number(tableEditId || 0) !== Number(selectedVisible.id || 0),
        onSelect: () => {
          closeCommandPalette();
          void handleTableEditSave(selectedVisible);
        },
      },
      {
        id: 'deactivate-selected',
        label:
          canBulkDeactivate && selectedCount > 1
            ? 'Deactivate selected rows'
            : 'Deactivate selected product',
        description: 'Mark the selected product rows inactive.',
        shortcut: 'Archive',
        icon: <Trash2 size={16} />,
        keywords: ['deactivate', 'inactive', 'delete', 'archive'],
        disabled: !canBulkDeactivate,
        onSelect: async () => {
          closeCommandPalette();
          if (selectedCount === 1 && selectedVisible) {
            await handleDeleteProduct(selectedVisible.id);
            return;
          }
          const result = await handleBulkProductUpdate(selectedIds, { is_active: 0 });
          if (result?.success) {
            clearBulkSelection();
          }
        },
      },
      {
        id: 'undo-last-action',
        label: 'Undo last table action',
        description: 'Restore the last edit, deactivate, or delete action.',
        shortcut: 'Undo',
        icon: <RotateCcw size={16} />,
        keywords: ['undo', 'restore', 'revert'],
        disabled: !tableUndoAction,
        onSelect: () => {
          closeCommandPalette();
          void handleUndoLastTableAction();
        },
      },
    ];
  }, [
    clearBulkSelection,
    closeCommandPalette,
    focusProductSearch,
    handleAddProduct,
    handleBulkProductUpdate,
    handleDeleteProduct,
    handleEditProduct,
    handleTableEditSave,
    handleUndoLastTableAction,
    openTableEdit,
    selectedCount,
    selectedProductIdSet,
    selectedVisibleCount,
    selectedVisibleProduct,
    tableEditId,
    tableUndoAction,
    visibleProducts.length,
    selectVisibleProducts,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleGlobalShortcut = (event) => {
      const key = String(event.key || '').toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener('keydown', handleGlobalShortcut);
    return () => window.removeEventListener('keydown', handleGlobalShortcut);
  }, [openCommandPalette]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCommandPaletteQuery('');
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    clearBulkSelection();
  }, [
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
    productsPage,
    clearBulkSelection,
  ]);

  useEffect(() => {
    if (selectedProductIds.length === 1) {
      const [singleId] = selectedProductIds;
      if (Number(singleId) !== Number(selectedProductId || 0)) {
        setSelectedProductId(singleId);
      }
      return;
    }
    if (Number(selectedProductId || 0) !== 0) {
      setSelectedProductId(0);
    }
  }, [selectedProductIds, selectedProductId, setSelectedProductId]);

  const handleBulkEditSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      const payload = {};
      const category = String(bulkEditForm.category || '').trim();
      const price = String(bulkEditForm.price || '').trim();
      const stock = String(bulkEditForm.stock || '').trim();
      const status = String(bulkEditForm.status || '').trim();

      if (category) payload.category = category;
      if (price !== '') {
        const parsedPrice = Number(price);
        if (Number.isFinite(parsedPrice)) payload.price = parsedPrice;
      }
      if (stock !== '') {
        const parsedStock = Number(stock);
        if (Number.isFinite(parsedStock)) payload.stock = parsedStock;
      }
      if (status !== '') {
        payload.is_active = Number(status);
      }

      if (Object.keys(payload).length === 0 || selectedCount === 0) {
        return;
      }

      try {
        setBulkSaving(true);
        const result = await handleBulkProductUpdate(Array.from(selectedProductIdSet), payload);
        if (result?.success) {
          clearBulkSelection();
        }
      } finally {
        setBulkSaving(false);
      }
    },
    [bulkEditForm, clearBulkSelection, handleBulkProductUpdate, selectedCount, selectedProductIdSet]
  );

  return (
    <div className="products-management">
      <AdminPageHeader
        className="section-header"
        title="Products Management"
        actions={
          <div className="products-actions">
            <div className="products-actions-right">
              {!isMobile && (
                <>
                  <div className="products-io-icons">
                    <button
                      type="button"
                      className="products-icon-btn products-icon-btn-add"
                      onClick={handleAddProduct}
                      title="Add product"
                      aria-label="Add product"
                    >
                      <span className="products-icon-plus" aria-hidden="true">
                        +
                      </span>
                    </button>
                    <button
                      type="button"
                      className="products-icon-btn"
                      onClick={() => setShowExportDialog(true)}
                      disabled={importBusy}
                      title="Export products"
                      aria-label="Export products"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      type="button"
                      className="products-icon-btn"
                      onClick={handleStartImport}
                      disabled={importBusy}
                      title="Import products"
                      aria-label="Import products"
                    >
                      <Upload size={16} />
                    </button>
                    <button
                      type="button"
                      className="products-icon-btn"
                      onClick={handleConfirmImport}
                      disabled={importBusy || !importPreviewData?.batch_id}
                      title="Confirm import"
                      aria-label="Confirm import"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </div>
                  <div
                    className={`products-view-switch ${effectiveProductViewMode === 'grid' ? 'is-grid' : 'is-table'}`}
                    role="group"
                    aria-label="Product view mode"
                  >
                    <button
                      type="button"
                      className={`products-view-switch-option table ${effectiveProductViewMode === 'table' ? 'active' : ''}`}
                      onClick={() => setProductViewMode('table')}
                      aria-pressed={effectiveProductViewMode === 'table'}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      className={`products-view-switch-option grid ${effectiveProductViewMode === 'grid' ? 'active' : ''}`}
                      onClick={() => setProductViewMode('grid')}
                      aria-pressed={effectiveProductViewMode === 'grid'}
                    >
                      Grid
                    </button>
                    <span className="products-view-switch-knob" aria-hidden="true">
                      {effectiveProductViewMode === 'grid' ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        <X size={14} />
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        }
      />
      <ProductsImportCard
        showProductsImportCard={showProductsImportCard}
        importPreviewData={importPreviewData}
        importFile={importFile}
        importAllowIdenticalRows={importAllowIdenticalRows}
        setImportAllowIdenticalRows={setImportAllowIdenticalRows}
        importFileInputRef={importFileInputRef}
        importBusy={importBusy}
        handleFileSelected={handleFileSelected}
      />
      <div className="products-common-toolbar">
        <input
          id="products-search"
          name="products_search"
          type="text"
          className="products-table-search products-common-search"
          placeholder="Search by name, SKU, barcode, category, brand..."
          value={productTableSearchDraft}
          onChange={(e) => setProductTableSearchDraft(e.target.value)}
        />
        <button
          type="button"
          className="products-toolbar-action products-command-btn"
          onClick={openCommandPalette}
          title="Open command palette (Ctrl/⌘ + K)"
          aria-label="Open command palette"
        >
          <Command size={16} />
          <span>Commands</span>
        </button>
        <span className="products-table-count">
          Rows: {visibleProducts.length}
          {productsTotal ? ` / ${productsTotal}` : ''}
        </span>
        <div className="products-pagination">
          <button
            type="button"
            className="products-page-btn"
            onClick={() => setProductsPage((prev) => Math.max(1, Number(prev || 1) - 1))}
            disabled={!canPrev || productsLoading}
          >
            Prev
          </button>
          <span className="products-page-status">
            Page {productsPage} / {totalPages}
          </span>
          <button
            type="button"
            className="products-page-btn"
            onClick={() => setProductsPage((prev) => Math.min(totalPages, Number(prev || 1) + 1))}
            disabled={!canNext || productsLoading}
          >
            Next
          </button>
        </div>
      </div>
      <ProductsSelectionBar
        selectedCount={selectedCount}
        visibleProducts={visibleProducts}
        selectedVisibleProduct={selectedSectionProduct}
        selectedVisibleCount={selectedVisibleCount}
        hasBulkChanges={hasBulkChanges}
        bulkEditForm={bulkEditForm}
        bulkSaving={bulkSaving}
        onBulkEditChange={handleBulkEditChange}
        onBulkSubmit={handleBulkEditSubmit}
        onSelectVisible={selectVisibleProducts}
        onClearSelection={clearBulkSelection}
        tableEditId={tableEditId}
        handleTableEditSave={handleTableEditSaveWithUndo}
        tableEditSaving={tableEditSaving}
        cancelTableEdit={cancelTableEdit}
        openTableEdit={openTableEdit}
        handleEditProduct={handleEditProduct}
        productEditLoadingId={productEditLoadingId}
        handleDeleteProduct={handleDeleteProductWithUndo}
        handlePermanentDeleteProduct={handlePermanentDeleteProductWithUndo}
      />
      <ProductsBulkJobStrip
        bulkJob={bulkJob}
        onCancel={handleCancelBulkJob}
        onRetry={handleRetryFailedBulkJob}
        onDismiss={dismissBulkJob}
      />
      {effectiveProductViewMode === 'table' ? (
        <ProductsTablePanel
          visibleProducts={visibleProducts}
          productTableCategoryFilter={productTableCategoryFilter}
          setProductTableCategoryFilter={setProductTableCategoryFilter}
          productCategories={productCategories}
          productColumnPickerRef={productColumnPickerRef}
          productTableVisibleColumns={productTableVisibleColumns}
          productTableAllColumnsSelected={productTableAllColumnsSelected}
          toggleSelectAllProductTableColumns={toggleSelectAllProductTableColumns}
          isProductTableColumnVisible={isProductTableColumnVisible}
          toggleProductTableColumn={toggleProductTableColumn}
          productTableStatusFilter={productTableStatusFilter}
          setProductTableStatusFilter={setProductTableStatusFilter}
          productTableLowStockOnly={productTableLowStockOnly}
          setProductTableLowStockOnly={setProductTableLowStockOnly}
          tableEditId={tableEditId}
          productTableCalculatedMinWidth={productTableCalculatedMinWidth}
          toggleProductTableSort={toggleProductTableSort}
          getSortIndicator={getSortIndicator}
          tableEditForm={tableEditForm}
          handleTableCellClick={handleTableCellClick}
          setTableEditFieldRef={setTableEditFieldRef}
          handleTableEditChange={handleTableEditChange}
          handleTableEditKeyDown={handleTableEditKeyDown}
          tableUndoAction={tableUndoAction}
          handleUndoLastTableAction={handleUndoLastTableAction}
          tableUndoSaving={tableUndoSaving}
          selectedProductIds={selectedProductIds}
          toggleProductSelection={toggleProductSelection}
          getCategoryPath={getCategoryPath}
          getBrandPath={getBrandPath}
        />
      ) : (
        <ProductsGridPanel
          isMobile={isMobile}
          showQuickAdd={showQuickAdd}
          setShowQuickAdd={setShowQuickAdd}
          quickAddForm={quickAddForm}
          setQuickAddForm={setQuickAddForm}
          resetQuickAdd={resetQuickAdd}
          quickSaving={quickSaving}
          handleQuickAddSave={handleQuickAddSave}
          visibleProducts={visibleProducts}
          quickEditId={quickEditId}
          quickEditForm={quickEditForm}
          setQuickEditForm={setQuickEditForm}
          cancelQuickEdit={cancelQuickEdit}
          handleQuickEditSave={handleQuickEditSave}
          startQuickEdit={startQuickEdit}
          getProductImageSrc={getProductImageSrc}
          getProductFallbackImage={getProductFallbackImage}
          getCategoryPath={getCategoryPath}
          getBrandPath={getBrandPath}
          handleEditProduct={handleEditProduct}
          productEditLoadingId={productEditLoadingId}
          handleDeleteProduct={handleDeleteProduct}
          productCategories={productCategories}
          selectedProductIds={selectedProductIds}
          toggleProductSelection={toggleProductSelection}
        />
      )}
      <CommandPalette
        open={commandPaletteOpen}
        query={commandPaletteQuery}
        setQuery={setCommandPaletteQuery}
        actions={commandPaletteActions}
        onClose={closeCommandPalette}
      />
    </div>
  );
}

export default ProductsSection;
