import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eraser,
  RefreshCw,
  RotateCw,
  ShoppingCart,
  SlidersHorizontal,
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
import '../../inventory/StockLedgerHistory.css';
import { DropdownFilter, SearchFilter } from '../../../shared/components/filters';
import './RestockDashboardSection.css';

const LOW_STOCK_THRESHOLD = 10;
const RESTOCK_PO_REVIEW_STORAGE_KEY = 'restock_po_review_v1';

const SORTABLE_COLUMNS = {
  product: 'product',
  systemStock: 'systemStock',
  countedStock: 'countedStock',
  difference: 'difference',
};

const SEARCH_SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'product', label: 'Product' },
  { value: 'sku', label: 'SKU' },
  { value: 'category', label: 'Category' },
  { value: 'brand', label: 'Brand' },
  { value: 'supplier', label: 'Supplier' },
];

const SEARCH_SCOPE_COPY = {
  all: {
    placeholder: 'Search restock dashboard',
    ariaLabel: 'Search restock dashboard',
  },
  product: {
    placeholder: 'Search product',
    ariaLabel: 'Search product',
  },
  sku: {
    placeholder: 'Search SKU',
    ariaLabel: 'Search SKU',
  },
  category: {
    placeholder: 'Search category',
    ariaLabel: 'Search category',
  },
  brand: {
    placeholder: 'Search brand',
    ariaLabel: 'Search brand',
  },
  supplier: {
    placeholder: 'Search supplier',
    ariaLabel: 'Search supplier',
  },
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
    maximumFractionDigits: 0,
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

const formatSupplierSummaryLabel = (distributors = []) => {
  const names = Array.isArray(distributors)
    ? distributors
        .map((entry) => String(entry?.name || '').trim())
        .filter(Boolean)
    : [];

  if (!names.length) return 'No supplier linked';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} / ${names[1]}`;
  return `${names.slice(0, 2).join(' / ')} +${names.length - 2}`;
};

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
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [filters, setFilters] = useState({
    distributorId: '',
    category: '',
    brand: '',
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState({
    key: SORTABLE_COLUMNS.systemStock,
    direction: 'asc',
  });
  const deferredSearch = useDeferredValue(searchQuery);
  const activeSearchScopeCopy = SEARCH_SCOPE_COPY[searchScope] || SEARCH_SCOPE_COPY.all;

  const fetchDashboard = async ({ silent = false } = {}) => {
    setError('');
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [productsPayload, insightsPayload] = await Promise.all([
        productsApi.getAll({ limit: 500 }),
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

  const distributorFilterOptions = useMemo(() => ([
    { value: '__missing__', label: 'No supplier linked' },
    ...distributorOptions.map((entry) => ({
      value: String(entry.id || ''),
      label: entry.name,
    })),
  ]), [distributorOptions]);

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
        const haystackParts = (() => {
          switch (searchScope) {
            case 'product':
              return [row.name];
            case 'sku':
              return [row.sku];
            case 'category':
              return [row.categoryLabel];
            case 'brand':
              return [row.brandLabel];
            case 'supplier':
              return row.availableDistributors.map((entry) => entry.name).filter(Boolean);
            case 'all':
            default:
              return [
                row.name,
                row.sku,
                row.barcode,
                row.categoryLabel,
                row.brandLabel,
                row.availableDistributors.map((entry) => entry.name).join(' '),
              ];
          }
        })();
        const haystack = haystackParts.map(normalizeText).join(' ');
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
  }, [deferredSearch, filters.brand, filters.category, filters.distributorId, searchScope, sortedProducts]);

  const summary = useMemo(() => ({
    visibleCount: visibleProducts.length,
    lowStockCount: visibleProducts.filter((row) => row.stockStatus === 'low_stock').length,
    mismatchCount: visibleProducts.filter((row) => row.stockMismatch).length,
    selectedCount: selectedIds.length,
  }), [selectedIds.length, visibleProducts]);

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

  const handleSearchDraftChange = (value) => {
    setSearchDraft(value);
  };

  const handleSearchSubmit = (value) => {
    setSearchQuery(String(value || '').trim());
  };

  const handleSingleFilterChange = (items, key) => {
    const nextValue = Array.isArray(items) && items.length ? String(items[0] || '') : '';
    setFilters((current) => ({
      ...current,
      [key]: nextValue,
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

  const clearFilters = () => {
    setSearchDraft('');
    setSearchQuery('');
    setSearchScope('all');
    setFilters({
      distributorId: '',
      category: '',
      brand: '',
    });
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

  const activeFilterCount = [
    searchQuery,
    filters.distributorId,
    filters.category,
    filters.brand,
  ].filter(Boolean).length;

  const activeFilterPills = useMemo(() => {
    const pills = [];
    if (filters.distributorId) {
      const label = filters.distributorId === '__missing__'
        ? 'Supplier: No link'
        : `Supplier: ${
          distributorOptions.find((entry) => String(entry.id || '') === filters.distributorId)?.name || 'Supplier'
        }`;
      pills.push({
        key: 'supplier',
        label,
        onClear: () => setFilters((current) => ({ ...current, distributorId: '' })),
      });
    }
    if (filters.category) {
      pills.push({
        key: 'category',
        label: `Category: ${filters.category}`,
        onClear: () => setFilters((current) => ({ ...current, category: '' })),
      });
    }
    if (filters.brand) {
      pills.push({
        key: 'brand',
        label: `Brand: ${filters.brand}`,
        onClear: () => setFilters((current) => ({ ...current, brand: '' })),
      });
    }
    return pills;
  }, [distributorOptions, filters.brand, filters.category, filters.distributorId]);

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
        is_active: row.is_active ?? row.isActive ?? true,
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
        <div className="loading" role="status" aria-live="polite">
          Loading restock dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="restock-dashboard stock-ledger-history">
      <BackofficePageHeader
        className="page-header"
        title="Restock Dashboard"
        subtitle="Review active products, update counted stock when needed, and move selected items into a supplier PO."
        actions={(
          <div className="restock-header-actions">
            <button
              type="button"
              className="admin-btn restock-header-icon"
              onClick={() => { void fetchDashboard({ silent: true }); }}
              disabled={refreshing}
              title="Refresh restock data"
              aria-label="Refresh restock data"
            >
              <RefreshCw size={18} />
              <span>Refresh</span>
            </button>
          </div>
        )}
      />

      {error ? <div className="error-message">{error}</div> : null}
      {syncError ? <div className="error-message">{syncError}</div> : null}
      {syncSuccess ? <div className="success-message">{syncSuccess}</div> : null}

      <section className="restock-workspace-bar">
        <div className="restock-filter-surface">
          <div className="filters-bar stock-ledger-filters">
            <SearchFilter
              id="restock-search"
              placeholder={activeSearchScopeCopy.placeholder}
              value={searchDraft}
              onChange={handleSearchDraftChange}
              onSubmit={handleSearchSubmit}
              width="100%"
              stretch
              className="stock-ledger-search-filter"
              tone="sky"
              ariaLabel={activeSearchScopeCopy.ariaLabel}
              ariaAutocomplete="none"
              scopeOptions={SEARCH_SCOPE_OPTIONS}
              scopeValue={searchScope}
              onScopeChange={setSearchScope}
              scopeAriaLabel="Search scope"
              submitAriaLabel={activeSearchScopeCopy.ariaLabel}
            />

            <button
              type="button"
              className={`stock-ledger-filter-toggle${showAdvancedFilters ? ' is-open' : ''}`}
              onClick={() => setShowAdvancedFilters((current) => !current)}
              aria-expanded={showAdvancedFilters}
              aria-controls="restock-advanced-filters"
            >
              <SlidersHorizontal size={14} />
              <span>Filters</span>
              {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
              {showAdvancedFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {(searchDraft || searchQuery || activeFilterCount) ? (
              <button type="button" className="stock-ledger-filter-clear" onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </div>

          {activeFilterPills.length ? (
            <div className="stock-ledger-active-filters" aria-label="Active filters">
              {activeFilterPills.map((pill) => (
                <button key={pill.key} type="button" className="stock-ledger-active-filter-pill" onClick={pill.onClear}>
                  <span>{pill.label}</span>
                  <X size={12} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}

          {showAdvancedFilters ? (
            <div id="restock-advanced-filters" className="stock-ledger-advanced-filters">
              <div className="stock-ledger-filter-row stock-ledger-filter-row--supplier">
                <span className="stock-ledger-filter-row-label">Supplier</span>
                <DropdownFilter
                  options={distributorFilterOptions}
                  selectedItems={filters.distributorId ? [filters.distributorId] : []}
                  onChange={(items) => handleSingleFilterChange(items, 'distributorId')}
                  width="100%"
                  allLabel="All suppliers"
                  tone="violet"
                  className="stock-ledger-filter-row-control"
                />
              </div>
              <div className="stock-ledger-filter-row stock-ledger-filter-row--category">
                <span className="stock-ledger-filter-row-label">Category</span>
                <DropdownFilter
                  options={categoryOptions}
                  selectedItems={filters.category ? [filters.category] : []}
                  onChange={(items) => handleSingleFilterChange(items, 'category')}
                  width="100%"
                  allLabel="All categories"
                  tone="sky"
                  className="stock-ledger-filter-row-control"
                />
              </div>
              <div className="stock-ledger-filter-row stock-ledger-filter-row--brand">
                <span className="stock-ledger-filter-row-label">Brand</span>
                <DropdownFilter
                  options={brandOptions}
                  selectedItems={filters.brand ? [filters.brand] : []}
                  onChange={(items) => handleSingleFilterChange(items, 'brand')}
                  width="100%"
                  allLabel="All brands"
                  tone="amber"
                  className="stock-ledger-filter-row-control"
                />
              </div>
            </div>
          ) : null}
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

      <div className="summary-stats">
        <div className="stat-card restock-total">
          <span className="stat-value">{summary.visibleCount}</span>
          <span className="stat-label">Visible Products</span>
        </div>
        <div className="stat-card restock-low-stock">
          <span className="stat-value">{summary.lowStockCount}</span>
          <span className="stat-label">Low Stock</span>
        </div>
        <div className="stat-card restock-mismatch">
          <span className="stat-value">{summary.mismatchCount}</span>
          <span className="stat-label">Need Sync</span>
        </div>
        <div className="stat-card restock-selected">
          <span className="stat-value">{summary.selectedCount}</span>
          <span className="stat-label">Selected</span>
        </div>
      </div>

      <div className="ledger-table-container restock-table-container">
        {visibleProducts.length === 0 ? (
          <div className="empty-state">
            <p>No active products match the current restock filters.</p>
            <p>Adjust search or filters to review more items.</p>
          </div>
        ) : (
          <table className="ledger-table restock-table">
            <colgroup>
              <col className="col-select" />
              <col className="col-product" />
              <col className="col-stock" />
              <col className="col-counted" />
              <col className="col-diff" />
              <col className="col-action" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className="select-header">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectVisible}
                    disabled={!visibleProductIds.length}
                    aria-label="Select visible rows"
                  />
                </th>
                <th scope="col" aria-sort={sortConfig.key === SORTABLE_COLUMNS.product ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    className={`ledger-sort-btn${sortConfig.key === SORTABLE_COLUMNS.product ? ' is-active' : ''}`}
                    onClick={() => handleSortChange(SORTABLE_COLUMNS.product)}
                    aria-label="Sort by product"
                    title="Sort by product"
                  >
                    <span className="ledger-sort-label">Product</span>
                    <span className="ledger-sort-indicator" aria-hidden="true">{renderSortIcon(SORTABLE_COLUMNS.product)}</span>
                  </button>
                </th>
                <th scope="col" aria-sort={sortConfig.key === SORTABLE_COLUMNS.systemStock ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    className={`ledger-sort-btn${sortConfig.key === SORTABLE_COLUMNS.systemStock ? ' is-active' : ''}`}
                    onClick={() => handleSortChange(SORTABLE_COLUMNS.systemStock)}
                    aria-label="Sort by system stock"
                    title="Sort by system stock"
                  >
                    <span className="ledger-sort-label">Stock</span>
                    <span className="ledger-sort-indicator" aria-hidden="true">{renderSortIcon(SORTABLE_COLUMNS.systemStock)}</span>
                  </button>
                </th>
                <th scope="col" aria-sort={sortConfig.key === SORTABLE_COLUMNS.countedStock ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    className={`ledger-sort-btn${sortConfig.key === SORTABLE_COLUMNS.countedStock ? ' is-active' : ''}`}
                    onClick={() => handleSortChange(SORTABLE_COLUMNS.countedStock)}
                    aria-label="Sort by counted stock"
                    title="Sort by counted stock"
                  >
                    <span className="ledger-sort-label">Counted</span>
                    <span className="ledger-sort-indicator" aria-hidden="true">{renderSortIcon(SORTABLE_COLUMNS.countedStock)}</span>
                  </button>
                </th>
                <th scope="col" aria-sort={sortConfig.key === SORTABLE_COLUMNS.difference ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button
                    type="button"
                    className={`ledger-sort-btn${sortConfig.key === SORTABLE_COLUMNS.difference ? ' is-active' : ''}`}
                    onClick={() => handleSortChange(SORTABLE_COLUMNS.difference)}
                    aria-label="Sort by difference"
                    title="Sort by difference"
                  >
                    <span className="ledger-sort-label">Diff</span>
                    <span className="ledger-sort-indicator" aria-hidden="true">{renderSortIcon(SORTABLE_COLUMNS.difference)}</span>
                  </button>
                </th>
                <th scope="col">
                  <span className="ledger-sort-btn static-label">Sync</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((row) => {
                const syncing = syncingIds.includes(row.productId);
                const isSelected = selectedIds.includes(row.productId);
                const supplierSummary = formatSupplierSummaryLabel(row.availableDistributors);
                const supplierTitle = row.availableDistributors.length
                  ? row.availableDistributors.map((entry) => entry.name).join(', ')
                  : 'No supplier linked';
                const rowTitle = `${row.name} | ${row.sku || 'No SKU'} | ${row.brandLabel} | ${row.categoryLabel} | ${supplierTitle}`;

                return (
                  <tr
                    key={row.productId}
                    className="restock-row"
                    title={rowTitle}
                  >
                    <td className="select-cell" data-label="Select">
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
                    <td className="product-cell" data-label="Product">
                      <div className="restock-product-cell">
                        <SafeProductImage product={row} alt="" className="restock-product-image" />
                        <div className="restock-product-copy">
                          <span className="product-name">{row.name}</span>
                          <span className="product-linked-number">{row.sku || 'No SKU'} · {row.brandLabel}</span>
                          <span className="product-linked-number">{supplierSummary}</span>
                        </div>
                      </div>
                    </td>
                    <td className={row.currentStock <= LOW_STOCK_THRESHOLD ? 'restock-stock-low qty-cell' : 'qty-cell'} data-label="Stock">
                      <span className={row.currentStock <= LOW_STOCK_THRESHOLD ? 'negative' : ''}>{formatQty(row.currentStock)}</span>
                    </td>
                    <td data-label="Counted">
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
                    <td className={`qty-cell restock-diff-cell${row.difference > 0 ? ' positive' : ''}${row.difference < 0 ? ' negative' : ''}`} data-label="Diff">
                      <span className={row.draftQty === null ? '' : (row.difference >= 0 ? 'positive' : 'negative')}>
                        {row.draftQty === null ? '—' : formatSignedQty(row.difference)}
                      </span>
                    </td>
                    <td data-label="Sync">
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
                      ) : (
                        <span className="restock-action-placeholder">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default RestockDashboardSection;
