import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Eraser,
  RefreshCw,
  RotateCw,
  Search,
  ShoppingCart,
  X,
} from 'lucide-react';
import BackofficePageHeader from '../../../shared/components/backoffice/BackofficePageHeader';
import SafeProductImage from '../../../shared/components/product/SafeProductImage';
import { broadcastBackofficePopupMessage } from '../../../shared/utils/backofficePopup';
import {
  safeSessionStorageGet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
} from '../../../shared/utils/storage';
import {
  insightsApi,
  productsApi,
  stockLedgerApi,
} from '../../../shared/services/api';
import './RestockDashboardSection.css';

const LOW_STOCK_THRESHOLD = 10;
const RESTOCK_PO_REVIEW_STORAGE_KEY = 'restock_po_review_v1';

const SORTABLE_COLUMNS = {
  product: 'product',
  systemStock: 'systemStock',
  countedStock: 'countedStock',
  difference: 'difference',
};

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const formatQty = (value) => {
  const normalized = asNumber(value, 0);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(normalized);
};

const formatSignedQty = (value) => {
  const normalized = asNumber(value, 0);
  if (normalized > 0) return `+${formatQty(normalized)}`;
  if (normalized < 0) return `-${formatQty(Math.abs(normalized))}`;
  return '0';
};

const getBrandLabel = (product) => (
  String(product?.brand_path || product?.brand || '').trim() || 'Unbranded'
);

const getCategoryLabel = (product) => (
  String(product?.category_path || product?.category || '').trim() || 'Uncategorized'
);

const getPoUnitLabel = (product = {}) => (
  String(product?.base_unit || product?.uom || 'pcs').trim() || 'pcs'
);

const createDefaultPoReviewDraft = () => ({
  distributorId: '',
  expectedDelivery: '',
  notes: '',
});

const readStoredRestockPoReview = () => {
  try {
    const raw = safeSessionStorageGet(RESTOCK_PO_REVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const selectedIds = Array.isArray(parsed?.selectedIds)
      ? parsed.selectedIds.map((value) => Number(value || 0)).filter((value) => value > 0)
      : [];
    const poQuantities = parsed?.poQuantities && typeof parsed.poQuantities === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.poQuantities)
            .map(([key, value]) => [String(key), String(value || '').trim()])
            .filter(([key, value]) => key && value)
        )
      : {};
    const draft = parsed?.poReviewDraft && typeof parsed.poReviewDraft === 'object'
      ? {
          ...createDefaultPoReviewDraft(),
          ...parsed.poReviewDraft,
        }
      : createDefaultPoReviewDraft();
    if (!selectedIds.length) return null;
    return {
      selectedIds,
      poQuantities,
      poReviewDraft: draft,
    };
  } catch (_) {
    return null;
  }
};

const dedupeDistributors = (entries = []) => {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const id = Number(entry?.id || 0);
    const name = String(entry?.name || '').trim();
    const key = id > 0 ? `id:${id}` : `name:${name.toLowerCase()}`;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push({ id: id || null, name });
  }
  return result;
};

const getKnownDistributors = (insight = {}) => {
  const explicit = Array.isArray(insight?.available_distributors)
    ? insight.available_distributors
    : [];
  if (explicit.length) {
    return dedupeDistributors(explicit);
  }
  return dedupeDistributors([
    {
      id: insight?.latest_distributor_id,
      name: insight?.latest_distributor_name,
    },
    {
      id: insight?.best_distributor_id,
      name: insight?.best_distributor_name,
    },
  ]);
};

const compareValues = (left, right, direction = 'asc') => {
  if (left === right) return 0;
  const order = direction === 'desc' ? -1 : 1;
  if (typeof left === 'number' && typeof right === 'number') {
    return left > right ? order : -order;
  }
  return String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' }) * order;
};

function RestockDashboardSection({
  onTabChange,
  onOpenPurchaseOrder,
}) {
  const restoredReviewStateRef = useRef(false);
  const linkedRestockSelectionRef = useRef(false);
  const [products, setProducts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');
  const [drafts, setDrafts] = useState({});
  const [poQuantities, setPoQuantities] = useState({});
  const [poReviewDraft, setPoReviewDraft] = useState(createDefaultPoReviewDraft);
  const [selectedIds, setSelectedIds] = useState([]);
  const [syncingIds, setSyncingIds] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    distributorId: '',
    category: '',
    brand: '',
  });
  const [sortConfig, setSortConfig] = useState({
    key: SORTABLE_COLUMNS.systemStock,
    direction: 'asc',
  });
  const deferredSearch = useDeferredValue(filters.search);

  const fetchDashboard = async ({ silent = false } = {}) => {
    setError('');
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [productsPayload, insightsPayload] = await Promise.all([
        productsApi.getAll(),
        insightsApi.getProducts(),
      ]);
      setProducts(Array.isArray(productsPayload) ? productsPayload : []);
      setInsights(Array.isArray(insightsPayload) ? insightsPayload : []);
    } catch (requestError) {
      setError(requestError?.message || 'Failed to load restock dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchDashboard();
  }, []);

  useEffect(() => {
    if (restoredReviewStateRef.current) return;
    restoredReviewStateRef.current = true;
    const storedReview = readStoredRestockPoReview();
    if (!storedReview) return;
    setSelectedIds(storedReview.selectedIds);
    setPoQuantities(storedReview.poQuantities);
    setPoReviewDraft(storedReview.poReviewDraft);
  }, []);

  useEffect(() => {
    if (!selectedIds.length) {
      safeSessionStorageRemove(RESTOCK_PO_REVIEW_STORAGE_KEY);
      if (linkedRestockSelectionRef.current) {
        broadcastBackofficePopupMessage({
          type: 'popup-handoff-cleared',
          kind: 'purchase',
          source: 'restock',
          updatedAt: Date.now(),
        });
        linkedRestockSelectionRef.current = false;
      }
      return;
    }
    linkedRestockSelectionRef.current = true;
    safeSessionStorageSet(RESTOCK_PO_REVIEW_STORAGE_KEY, JSON.stringify({
      selectedIds,
      poQuantities,
      poReviewDraft,
    }));
  }, [poQuantities, poReviewDraft, selectedIds]);

  const insightByProductId = useMemo(() => {
    const map = new Map();
    for (const row of insights) {
      const productId = Number(row?.product_id || 0);
      if (!productId) continue;
      map.set(productId, row);
    }
    return map;
  }, [insights]);

  const mergedProducts = useMemo(() => (
    (Array.isArray(products) ? products : []).map((product) => {
      const productId = Number(product?.id || 0);
      const insight = insightByProductId.get(productId) || {};
      const rawDraft = drafts[productId];
      const draftText = String(rawDraft?.quantity ?? '').trim();
      const currentStock = asNumber(product?.stock, 0);
      const countedStock = draftText === '' ? currentStock : asNumber(draftText, currentStock);
      const draftQty = draftText === '' ? null : countedStock;
      const difference = countedStock - currentStock;
      const availableDistributors = getKnownDistributors(insight);
      const effectiveStock = draftQty === null ? currentStock : countedStock;

      return {
        ...product,
        ...insight,
        productId,
        currentStock,
        countedStock,
        draftQty,
        draftText,
        difference,
        stockMismatch: draftQty !== null && difference !== 0,
        stockStatus: effectiveStock <= LOW_STOCK_THRESHOLD ? 'low_stock' : 'available',
        categoryLabel: getCategoryLabel(product),
        brandLabel: getBrandLabel(product),
        availableDistributors,
      };
    })
  ), [drafts, insightByProductId, products]);

  const distributorOptions = useMemo(() => {
    const options = new Map();
    for (const row of mergedProducts) {
      for (const distributor of row.availableDistributors) {
        const id = Number(distributor?.id || 0);
        const name = String(distributor?.name || '').trim();
        if (!id || !name || options.has(id)) continue;
        options.set(id, { id, name });
      }
    }
    return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [mergedProducts]);

  const categoryOptions = useMemo(() => (
    Array.from(new Set(mergedProducts.map((row) => row.categoryLabel))).sort((a, b) => a.localeCompare(b))
  ), [mergedProducts]);

  const brandOptions = useMemo(() => (
    Array.from(new Set(mergedProducts.map((row) => row.brandLabel))).sort((a, b) => a.localeCompare(b))
  ), [mergedProducts]);

  const sortedProducts = useMemo(() => {
    const rows = [...mergedProducts];
    rows.sort((left, right) => {
      if (sortConfig.key === SORTABLE_COLUMNS.product) {
        const byName = compareValues(left.name, right.name, sortConfig.direction);
        return byName || compareValues(left.productId, right.productId, 'asc');
      }
      if (sortConfig.key === SORTABLE_COLUMNS.countedStock) {
        const byCounted = compareValues(left.countedStock, right.countedStock, sortConfig.direction);
        return byCounted || compareValues(left.name, right.name, 'asc');
      }
      if (sortConfig.key === SORTABLE_COLUMNS.difference) {
        const byDifference = compareValues(left.difference, right.difference, sortConfig.direction);
        return byDifference || compareValues(left.name, right.name, 'asc');
      }
      const byStock = compareValues(left.currentStock, right.currentStock, sortConfig.direction);
      return byStock || compareValues(left.name, right.name, 'asc');
    });
    return rows;
  }, [mergedProducts, sortConfig.direction, sortConfig.key]);

  const visibleProducts = useMemo(() => {
    const query = normalizeText(deferredSearch);
    const selectedDistributorId = Number(filters.distributorId || 0) || null;
    return sortedProducts.filter((row) => {
      if (query) {
        const haystack = [
          row.name,
          row.sku,
          row.barcode,
          row.categoryLabel,
          row.brandLabel,
          row.availableDistributors.map((entry) => entry.name).join(' '),
        ].map(normalizeText).join(' ');
        if (!haystack.includes(query)) return false;
      }

      if (filters.distributorId === '__missing__' && row.availableDistributors.length > 0) {
        return false;
      }

      if (selectedDistributorId) {
        const matchesKnownDistributor = row.availableDistributors.some((entry) => Number(entry.id || 0) === selectedDistributorId);
        if (!matchesKnownDistributor) {
          return false;
        }
      }

      if (filters.category && filters.category !== row.categoryLabel) return false;
      if (filters.brand && filters.brand !== row.brandLabel) return false;
      return true;
    });
  }, [deferredSearch, filters.brand, filters.category, filters.distributorId, sortedProducts]);

  const summary = useMemo(() => ({
    lowStockCount: mergedProducts.filter((row) => row.stockStatus === 'low_stock').length,
    availableCount: mergedProducts.filter((row) => row.stockStatus === 'available').length,
    mismatchCount: mergedProducts.filter((row) => row.stockMismatch).length,
    selectedCount: selectedIds.length,
  }), [mergedProducts, selectedIds.length]);

  const visibleProductIds = useMemo(() => (
    visibleProducts.map((row) => row.productId)
  ), [visibleProducts]);

  const allVisibleSelected = visibleProductIds.length > 0
    && visibleProductIds.every((id) => selectedIds.includes(id));

  const selectedRows = useMemo(() => (
    mergedProducts.filter((row) => selectedIds.includes(row.productId))
  ), [mergedProducts, selectedIds]);

  const selectedVisibleRows = useMemo(() => (
    visibleProducts.filter((row) => selectedIds.includes(row.productId))
  ), [selectedIds, visibleProducts]);

  const selectedSyncRows = useMemo(() => (
    selectedRows.filter((row) => row.stockMismatch)
  ), [selectedRows]);

  const selectedDistributorId = Number(filters.distributorId || 0) || null;
  const effectivePoDistributorId = Number(poReviewDraft.distributorId || filters.distributorId || 0) || null;
  const effectivePoDistributorName = effectivePoDistributorId
    ? String(
        distributorOptions.find((entry) => Number(entry.id || 0) === effectivePoDistributorId)?.name || ''
      ).trim()
    : '';
  const selectedHiddenCount = Math.max(0, selectedRows.length - selectedVisibleRows.length);
  const canProceedToPo = Boolean(selectedRows.length > 0);

  useEffect(() => {
    if (selectedIds.length > 0) return;
    setPoReviewDraft(createDefaultPoReviewDraft());
  }, [selectedIds.length]);

  const handleFilterChange = (field) => (event) => {
    const { value } = event.target;
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleDraftChange = (productId, value) => {
    setDrafts((current) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      const numeric = asNumber(trimmed, NaN);
      if (!Number.isFinite(numeric) || numeric < 0) {
        return current;
      }
      return {
        ...current,
        [productId]: {
          quantity: trimmed,
        },
      };
    });
  };

  const handlePoQuantityChange = (productId, value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      setPoQuantities((current) => ({
        ...current,
        [productId]: '1',
      }));
      return;
    }
    const numeric = asNumber(trimmed, NaN);
    if (!Number.isFinite(numeric) || numeric < 1) {
      return;
    }
    setPoQuantities((current) => ({
      ...current,
      [productId]: String(Math.max(1, Math.round(numeric))),
    }));
  };

  const toggleSelectedProduct = (productId) => {
    const isSelected = selectedIds.includes(productId);
    setSelectedIds((current) => (
      isSelected
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
    setPoQuantities((current) => {
      if (isSelected) {
        const next = { ...current };
        delete next[productId];
        return next;
      }
      if (current[productId]) return current;
      return {
        ...current,
        [productId]: '1',
      };
    });
  };

  const toggleSelectVisible = () => {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visibleProductIds.includes(id));
      }
      return Array.from(new Set([...current, ...visibleProductIds]));
    });
    setPoQuantities((current) => {
      const next = { ...current };
      if (allVisibleSelected) {
        for (const productId of visibleProductIds) {
          delete next[productId];
        }
        return next;
      }
      for (const productId of visibleProductIds) {
        if (!next[productId]) {
          next[productId] = '1';
        }
      }
      return next;
    });
  };

  const clearDrafts = () => {
    setDrafts({});
    setSyncError('');
    setSyncSuccess('');
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setPoQuantities({});
    setPoReviewDraft(createDefaultPoReviewDraft());
  };


  const handleSortChange = (columnKey) => {
    setSortConfig((current) => (
      current.key === columnKey
        ? { key: columnKey, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : {
            key: columnKey,
            direction: columnKey === SORTABLE_COLUMNS.product ? 'asc' : 'asc',
          }
    ));
  };

  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown size={14} />;
    return sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  const syncDrafts = async (productIds) => {
    const rows = mergedProducts.filter((row) => productIds.includes(row.productId) && row.stockMismatch);
    if (!rows.length) return;

    setSyncError('');
    setSyncSuccess('');
    setSyncingIds((current) => Array.from(new Set([...current, ...rows.map((row) => row.productId)])));

    try {
      const response = await stockLedgerApi.applyAdjustments({
        items: rows.map((row) => ({
          product_id: row.productId,
          quantity: row.countedStock,
          mode: 'set',
          notes: 'Restock dashboard stock sync',
        })),
      });
      const results = Array.isArray(response?.items) ? response.items : [];
      const resultByProductId = new Map(results.map((row) => [Number(row?.product_id || 0), row]));

      setProducts((current) => current.map((product) => {
        const update = resultByProductId.get(Number(product?.id || 0));
        if (!update) return product;
        return {
          ...product,
          stock: asNumber(update?.new_stock, asNumber(product?.stock, 0)),
        };
      }));
      setDrafts((current) => {
        const next = { ...current };
        for (const row of rows) {
          delete next[row.productId];
        }
        return next;
      });
      setSelectedIds((current) => current.filter((id) => !rows.some((row) => row.productId === id)));
      setPoQuantities((current) => {
        const next = { ...current };
        for (const row of rows) {
          delete next[row.productId];
        }
        return next;
      });
      setSyncSuccess(`${rows.length} item${rows.length === 1 ? '' : 's'} synced to system stock.`);
    } catch (requestError) {
      setSyncError(requestError?.message || 'Failed to sync stock updates');
    } finally {
      setSyncingIds((current) => current.filter((id) => !productIds.includes(id)));
    }
  };

  const handleProceedToPo = () => {
    setSyncError('');
    if (!selectedRows.length) {
      setSyncError('Select at least one product before proceeding to PO.');
      return;
    }

    const suggestedItems = selectedRows.map((row) => ({
      product_id: row.productId,
      product_name: row.name,
      quantity: Math.max(1, asNumber(poQuantities[row.productId], 1)),
      uom: getPoUnitLabel(row),
      product_snapshot: {
        id: row.productId,
        name: row.name,
        price: asNumber(row.price, 0),
        uom: String(row.uom || 'pcs').trim() || 'pcs',
        base_unit: getPoUnitLabel(row),
        conversion_factor: asNumber(row.conversion_factor, 1) || 1,
        purchase_pack_size: asNumber(row.purchase_pack_size, 0),
      },
    }));

    const handoffNotes = [
      String(poReviewDraft.notes || '').trim(),
      'Review quantities from the restock dashboard selection.',
    ].filter(Boolean).join('\n\n');

    if (typeof onOpenPurchaseOrder === 'function') {
      const payload = {
        source: 'restock',
        returnTab: 'restock-dashboard',
        autoCloseOnEmpty: true,
        suggestedItems,
        expectedDelivery: String(poReviewDraft.expectedDelivery || '').trim(),
        notes: handoffNotes,
      };
      if (effectivePoDistributorId) {
        payload.distributorId = effectivePoDistributorId;
        payload.distributorName = effectivePoDistributorName;
      }
      onOpenPurchaseOrder(payload);
      return;
    }
    onTabChange?.('purchases');
  };

  if (loading) {
    return (
      <div className="restock-dashboard">
        <BackofficePageHeader
          title="Restock Dashboard"
        subtitle="Preparing active products and supplier coverage."
        />
        <div className="restock-loading-state" role="status" aria-live="polite">
          Loading restock dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="restock-dashboard">
      <BackofficePageHeader
        title="Restock Dashboard"
          subtitle="Review active products, update counted stock when needed, and move selected items into a supplier PO."
        actions={(
          <div className="restock-header-actions">
            <button
              type="button"
              className="restock-icon-btn restock-header-icon"
              onClick={() => { void fetchDashboard({ silent: true }); }}
              disabled={refreshing}
              title="Refresh restock data"
              aria-label="Refresh restock data"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        )}
      />

      {error ? <div className="error-message">{error}</div> : null}
      {syncError ? <div className="error-message">{syncError}</div> : null}
      {syncSuccess ? <div className="success-message">{syncSuccess}</div> : null}

      <div className="restock-summary-label" role="status" aria-live="polite">
        <span>Low stock: <strong>{summary.lowStockCount}</strong></span>
        <span>Available: <strong>{summary.availableCount}</strong></span>
        <span>Need sync: <strong>{summary.mismatchCount}</strong></span>
        <span>Selected: <strong>{summary.selectedCount}</strong></span>
      </div>

      <section className="restock-workspace-bar">
        <div className="restock-search-field">
          <Search size={16} />
          <input
            type="text"
            value={filters.search}
            onChange={handleFilterChange('search')}
            placeholder="Search product, SKU, barcode, category, brand, supplier..."
          />
        </div>

        <div className="restock-filters-grid">
          <label>
            Supplier
            <select value={filters.distributorId} onChange={handleFilterChange('distributorId')}>
              <option value="">All suppliers</option>
              <option value="__missing__">No supplier linked</option>
              {distributorOptions.map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={filters.category} onChange={handleFilterChange('category')}>
              <option value="">All categories</option>
              {categoryOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Brand
            <select value={filters.brand} onChange={handleFilterChange('brand')}>
              <option value="">All brands</option>
              {brandOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="restock-workspace-toolbar">
          <div className="restock-workspace-summary" aria-live="polite">
            <span className="restock-workspace-pill strong">{selectedRows.length} selected</span>
            {selectedSyncRows.length ? <span className="restock-workspace-pill pending">{selectedSyncRows.length} sync</span> : null}
            {selectedHiddenCount ? <span className="restock-workspace-pill">{selectedHiddenCount} hidden</span> : null}
            {!selectedRows.length ? <span className="restock-workspace-hint">Select rows, then review.</span> : null}
          </div>

          <div className="restock-workspace-actions">
            <button
              type="button"
              className="restock-mini-action"
              onClick={toggleSelectVisible}
              title={allVisibleSelected ? 'Clear visible selection' : 'Select visible rows'}
              aria-label={allVisibleSelected ? 'Clear visible selection' : 'Select visible rows'}
            >
              <CheckCircle2 size={15} />
              <span>Visible</span>
            </button>
            <button
              type="button"
              className="restock-mini-action"
              onClick={clearSelection}
              disabled={!selectedRows.length}
              title="Clear selected rows"
              aria-label="Clear selected rows"
            >
              <X size={15} />
              <span>Clear</span>
            </button>
            <button
              type="button"
              className="restock-mini-action"
              onClick={clearDrafts}
              title="Clear counted stock drafts"
              aria-label="Clear counted stock drafts"
            >
              <Eraser size={15} />
              <span>Drafts</span>
            </button>
            <button
              type="button"
              className="restock-mini-action"
              onClick={() => { void syncDrafts(selectedSyncRows.map((row) => row.productId)); }}
              disabled={!selectedSyncRows.length || selectedSyncRows.some((row) => syncingIds.includes(row.productId))}
              title="Sync selected rows"
              aria-label="Sync selected rows"
            >
              <RotateCw size={15} />
              <span>Sync</span>
            </button>
            {selectedRows.length ? (
              <button
                type="button"
                className="restock-mini-action primary"
                onClick={handleProceedToPo}
                disabled={!canProceedToPo}
                title="Open purchase order workspace"
                aria-label="Open purchase order workspace"
              >
                <ShoppingCart size={15} />
                <span>Open PO</span>
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="restock-table-card">
        <div className="restock-table-head">
          <div>
            <h2>Products to Review</h2>
            <p>{visibleProducts.length} visible active products</p>
          </div>
          <button
            type="button"
            className="restock-link-btn"
            onClick={toggleSelectVisible}
            disabled={!visibleProductIds.length}
          >
            {allVisibleSelected ? 'Clear visible selection' : 'Select visible'}
          </button>
        </div>

        {visibleProducts.length === 0 ? (
          <div className="restock-empty-state">
            <p>No active products match the current restock filters.</p>
          </div>
        ) : (
          <div className="restock-table-wrap">
            <table className="restock-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectVisible}
                      disabled={!visibleProductIds.length}
                      aria-label="Select visible rows"
                    />
                  </th>
                  <th>
                    <button type="button" className="restock-sort-btn" onClick={() => handleSortChange(SORTABLE_COLUMNS.product)}>
                      Product
                      {renderSortIcon(SORTABLE_COLUMNS.product)}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="restock-sort-btn" onClick={() => handleSortChange(SORTABLE_COLUMNS.systemStock)}>
                      System Stock
                      {renderSortIcon(SORTABLE_COLUMNS.systemStock)}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="restock-sort-btn" onClick={() => handleSortChange(SORTABLE_COLUMNS.countedStock)}>
                      Counted Stock
                      {renderSortIcon(SORTABLE_COLUMNS.countedStock)}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="restock-sort-btn" onClick={() => handleSortChange(SORTABLE_COLUMNS.difference)}>
                      Difference
                      {renderSortIcon(SORTABLE_COLUMNS.difference)}
                    </button>
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.map((row) => {
                  const syncing = syncingIds.includes(row.productId);
                  const isSelected = selectedIds.includes(row.productId);
                  return (
                    <tr
                      key={row.productId}
                      className={`restock-row restock-row-${row.stockStatus.replace('_', '-')}${row.stockMismatch ? ' restock-row-mismatch' : ''}`}
                    >
                      <td>
                        <div className="restock-select-cell">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectedProduct(row.productId)}
                            aria-label={`Select ${row.name}`}
                          />
                          {isSelected ? (
                            <small className="restock-select-qty-label">In PO review</small>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="restock-product-cell">
                          <SafeProductImage product={row} alt="" className="restock-product-image" />
                          <div className="restock-product-copy">
                            <strong>{row.name}</strong>
                            <span>{row.sku || 'No SKU'} · {row.brandLabel}</span>
                            <small className="restock-product-category">{row.categoryLabel}</small>
                            <div className="restock-product-distributors">
                              {row.availableDistributors.length ? (
                                row.availableDistributors.map((entry) => (
                                  <small key={`${row.productId}-${entry.id || entry.name}`}>{entry.name}</small>
                                ))
                              ) : (
                                <small className="restock-product-muted">No supplier linked</small>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={row.currentStock <= LOW_STOCK_THRESHOLD ? 'restock-stock-low' : ''}>
                        {formatQty(row.currentStock)}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={drafts[row.productId]?.quantity || ''}
                          onChange={(event) => handleDraftChange(row.productId, event.target.value)}
                          className="restock-qty-input"
                          placeholder={String(row.currentStock)}
                          aria-label={`Counted stock for ${row.name}`}
                        />
                      </td>
                      <td className={`restock-diff-cell${row.difference > 0 ? ' positive' : ''}${row.difference < 0 ? ' negative' : ''}`}>
                        {row.draftQty === null ? '-' : formatSignedQty(row.difference)}
                      </td>
                      <td>
                        {row.stockMismatch ? (
                          <button
                            type="button"
                            className="restock-icon-btn"
                            onClick={() => { void syncDrafts([row.productId]); }}
                            disabled={syncing}
                            title="Sync counted stock to system"
                            aria-label={`Sync ${row.name}`}
                          >
                            <RotateCw size={16} />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="restock-mobile-list">
              {visibleProducts.map((row) => {
                const syncing = syncingIds.includes(row.productId);
                const isSelected = selectedIds.includes(row.productId);
                return (
                  <article
                    key={`mobile-${row.productId}`}
                    className={`restock-mobile-card restock-row-${row.stockStatus.replace('_', '-')}${row.stockMismatch ? ' restock-row-mismatch' : ''}`}
                  >
                    <div className="restock-mobile-head">
                      <div className="restock-product-cell">
                        <SafeProductImage product={row} alt="" className="restock-product-image" />
                        <div className="restock-product-copy">
                          <strong>{row.name}</strong>
                          <span>{row.sku || 'No SKU'} · {row.brandLabel}</span>
                          <small className="restock-product-category">{row.categoryLabel}</small>
                          <div className="restock-product-distributors">
                            {row.availableDistributors.length ? (
                              row.availableDistributors.map((entry) => (
                                <small key={`mobile-${row.productId}-${entry.id || entry.name}`}>{entry.name}</small>
                              ))
                            ) : (
                              <small className="restock-product-muted">No supplier linked</small>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="restock-select-cell restock-mobile-select-cell">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectedProduct(row.productId)}
                          aria-label={`Select ${row.name}`}
                        />
                        {isSelected ? (
                          <small className="restock-select-qty-label">In PO review</small>
                        ) : null}
                      </div>
                    </div>

                    <div className="restock-mobile-meta">
                      <span>System stock: {formatQty(row.currentStock)}</span>
                      <span>Status: {row.stockStatus === 'low_stock' ? 'Low Stock' : 'Available'}</span>
                    </div>

                    <div className="restock-mobile-controls">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={drafts[row.productId]?.quantity || ''}
                        onChange={(event) => handleDraftChange(row.productId, event.target.value)}
                        className="restock-qty-input"
                        placeholder={String(row.currentStock)}
                      />
                      <div className={`restock-diff-cell${row.difference > 0 ? ' positive' : ''}${row.difference < 0 ? ' negative' : ''}`}>
                        Difference: {row.draftQty === null ? '-' : formatSignedQty(row.difference)}
                      </div>
                    </div>

                    {row.stockMismatch ? (
                      <button
                        type="button"
                        className="restock-icon-btn restock-mobile-sync"
                        onClick={() => { void syncDrafts([row.productId]); }}
                        disabled={syncing}
                        aria-label={`Sync ${row.name}`}
                      >
                        <RotateCw size={16} />
                        {syncing ? 'Syncing...' : 'Sync'}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {selectedRows.length ? (
        <div className="restock-sticky-po-bar" role="status" aria-live="polite">
          <div className="restock-sticky-po-summary">
            <span>{selectedRows.length} selected</span>
            {selectedSyncRows.length ? <span>{selectedSyncRows.length} sync</span> : null}
          </div>
          <button
            type="button"
            className="restock-mini-action primary"
            onClick={handleProceedToPo}
            disabled={!canProceedToPo}
            title="Open purchase order workspace"
            aria-label="Open purchase order workspace"
          >
            <ShoppingCart size={15} />
            <span>Open PO</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default RestockDashboardSection;
