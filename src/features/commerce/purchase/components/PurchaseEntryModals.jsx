import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Layers,
  Plus,
  Search,
} from 'lucide-react';
import SafeProductImage from '../../../../shared/components/product/SafeProductImage';
import WindowModal from '../../../../shared/components/window/WindowModal';
import PurchaseDistributorSelector from './PurchaseDistributorSelector';
import PurchaseOrderEntryControlPanel from './PurchaseOrderEntryControlPanel';
import PurchaseOrderSummaryPanel from './PurchaseOrderSummaryPanel';
import ProductForm from '../../../catalog/products/components/form/ProductForm';

const hasMeaningfulDraftRow = (item = {}) =>
  Number(item?.product_id || 0) > 0 ||
  String(item?.product_query || '').trim().length > 0 ||
  String(item?.product_name || '').trim().length > 0 ||
  Number(item?.quantity || 0) > 0 ||
  Number(item?.rate ?? item?.unit_price ?? 0) > 0;
const formatReviewAmount = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const formatReviewTotalAmount = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
const normalizeDiscountColumnType = (value) =>
  String(value || '')
    .trim()
    .toLowerCase() === 'fixed'
    ? 'fixed'
    : 'percent';
const normalizeReviewDiscountType = (value) =>
  String(value || '')
    .trim()
    .toLowerCase() === 'fixed'
    ? 'fixed'
    : 'percent';
const getDiscountColumnLabel = (value) =>
  normalizeDiscountColumnType(value) === 'fixed' ? 'Disc ₹' : 'Disc %';
const getDiscountColumnSuffix = (value) =>
  normalizeDiscountColumnType(value) === 'fixed' ? '₹' : '%';
const PURCHASE_CREATE_REVIEW_PAGE_SIZE = 8;
const splitPurchaseCreateReviewRows = (rows = []) => {
  const pageRows = [];
  const size = PURCHASE_CREATE_REVIEW_PAGE_SIZE;
  for (let index = 0; index < rows.length; index += size) {
    pageRows.push(rows.slice(index, index + size));
  }
  return pageRows.length ? pageRows : [[]];
};
const resolveDiscountColumnType = (items = []) => {
  if (!Array.isArray(items) || !items.length) return 'percent';
  const preferredItem =
    items.find((item) => Number(item?.discount_value || 0) > 0) ||
    items.find((item) => hasMeaningfulDraftRow(item)) ||
    items[0];
  return normalizeDiscountColumnType(preferredItem?.discount_type);
};
const ORDER_FLOW_STEPS = [
  {
    key: 'supplier',
    label: 'Supplier',
    title: 'Select Supplier',
    description:
      'Choose the supplier first. The popup expands into the item screen after selection.',
  },
  {
    key: 'items',
    label: 'Items',
    title: 'Products',
    description: 'Enter quantity quickly, then review before final submit.',
  },
  {
    key: 'review',
    label: 'Review',
    title: 'Review Order',
    description: 'Check the compact review and then do the final submit.',
  },
];
const ORDER_FLOW_REVIEW_STEP = ORDER_FLOW_STEPS.length - 1;

const PurchaseCreateReviewPage = ({ rows, pageIndex, totalPages }) => (
  <div className="po-create-review-page">
    {totalPages > 1 ? (
      <div className="po-create-review-page-label">
        Page {pageIndex + 1} of {totalPages}
      </div>
    ) : null}
    <div className="po-review-bill-table">
      <div className="po-review-bill-head">
        <span>Item</span>
        <span>Qty</span>
        <span>Rate</span>
        <span>GST</span>
        <span>Disc</span>
        <span>Total</span>
      </div>
      {rows.length ? (
        rows.map((row) => {
          const discountType = normalizeReviewDiscountType(row.discountType);
          const discountValue = Number(row.discountValue || 0) || 0;
          const discountLabel =
            discountValue > 0
              ? `${formatReviewAmount(discountValue)}${discountType === 'fixed' ? '₹' : '%'}`
              : '-';
          return (
            <div key={row.key} className="po-review-bill-row">
              <span>{row.name}</span>
              <span>
                {row.quantity} {row.uom}
              </span>
              <span>{formatReviewAmount(row.rate)}</span>
              <span>{formatReviewAmount(row.gstRate)}%</span>
              <span>{discountLabel}</span>
              <strong>{formatReviewAmount(row.total)}</strong>
            </div>
          );
        })
      ) : (
        <div className="po-review-bill-row">
          <span>No items</span>
        </div>
      )}
    </div>
  </div>
);

const getDraftRowIssue = (rowDiagnostics = {}) => {
  if (rowDiagnostics.duplicateMessage) {
    return { tone: 'danger', text: 'Duplicate', detail: rowDiagnostics.duplicateMessage };
  }
  if (rowDiagnostics.discountBlockingMessage) {
    return { tone: 'danger', text: 'Fix discount', detail: rowDiagnostics.discountBlockingMessage };
  }
  if (rowDiagnostics.rateAcknowledgementMessage) {
    return { tone: 'bad', text: '', detail: rowDiagnostics.rateAcknowledgementMessage };
  }
  if (rowDiagnostics.discountAcknowledgementMessage) {
    return {
      tone: 'bad',
      text: 'Confirm discount',
      detail: rowDiagnostics.discountAcknowledgementMessage,
    };
  }
  if (rowDiagnostics.rateWarningMessage) {
    return {
      tone: rowDiagnostics.rateChangeTone || 'neutral',
      text: '',
      detail: rowDiagnostics.rateWarningMessage,
    };
  }
  if (rowDiagnostics.discountWarningMessage) {
    return {
      tone: 'neutral',
      text: 'Discount check',
      detail: rowDiagnostics.discountWarningMessage,
    };
  }
  return null;
};

const isSupplierDefaultItem = (item = {}) =>
  item?.po_item_locked === true ||
  item?.po_item_source === 'supplier_default' ||
  String(item?.row_source || '')
    .trim()
    .toLowerCase() === 'supplier';

const getPurchaseOrderRowProductSearchText = (entry = {}) => {
  const item = entry?.item || {};
  const product = entry?.product || {};
  return [item?.product_name, item?.product_query, product?.name, product?.sku, item?.sku]
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
    .join(' ');
};

const getPurchaseOrderRowProductSortLabel = (entry = {}) => {
  const item = entry?.item || {};
  const product = entry?.product || {};
  const name = String(item?.product_name || item?.product_query || product?.name || '')
    .trim()
    .toLowerCase();
  const sku = String(product?.sku || item?.sku || '')
    .trim()
    .toLowerCase();
  return `${name} ${sku}`.trim();
};

const getNextPurchaseOrderRowSortDirection = (direction) => {
  if (direction === 'ascending') return 'descending';
  if (direction === 'descending') return null;
  return 'ascending';
};

const PO_SELECTED_ROW_PAGE_SIZE = 12;

export function PurchaseOrderFormModal({
  open,
  closeOrderForm,
  poModalRef,
  poModalSize,
  editingOrderId,
  handleOrderSubmit,
  handleOpenOrderReview,
  orderReviewMode,
  closeOrderReview,
  loadingDistributorItems,
  orderFullMode,
  orderFormData,
  setOrderFormData,
  orderDraftProjection,
  handleDistributorInputChange,
  distributors,
  suppliers,
  orderProductOptions,
  getAllowedPurchaseUnitsForProduct,
  getPurchasePackStep,
  handleOrderItemChange,
  GST_RATE_OPTIONS,
  toNumber,
  handleOrderItemRemove,
  handleApplyCatalogProducts,
  supplierRegisteredProducts,
  orderTotals,
  orderSubmitting,
  savedOrderDrafts,
  saveCurrentOrderDraft,
  openSavedOrderDraft,
  deleteSavedOrderDraft,
  activeSavedOrderDraftId,
  onRefreshProducts,
  inline = false,
}) {
  const [mobileStep, setMobileStep] = useState(0);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState('');
  const [productPickerSelectedIds, setProductPickerSelectedIds] = useState([]);
  const [quickProductFormOpen, setQuickProductFormOpen] = useState(false);
  const [productPickerVisibleLimit, setProductPickerVisibleLimit] = useState(48);
  const [selectedRowsPageIndex, setSelectedRowsPageIndex] = useState(0);
  const [itemProductSearch, setItemProductSearch] = useState('');
  const [itemProductSortDirection, setItemProductSortDirection] = useState(null);
  const [discountColumnType, setDiscountColumnType] = useState(() =>
    resolveDiscountColumnType(orderFormData?.items)
  );
  const deferredProductPickerSearch = useDeferredValue(productPickerSearch);
  const deferredItemProductSearch = useDeferredValue(itemProductSearch);
  const distributorInputRef = useRef(null);
  const quantityInputRefs = useRef({});
  const formFooterRef = useRef(null);
  const submitButtonRef = useRef(null);
  const productPickerScrollRef = useRef(null);
  const productPickerLoadMoreRef = useRef(null);
  const previousDistributorIdRef = useRef('');
  const productPickerPageSize = 48;

  const items = useMemo(
    () => (Array.isArray(orderFormData?.items) ? orderFormData.items : []),
    [orderFormData]
  );
  const draftProjection = orderDraftProjection || {
    rows: [],
    diagnostics: {
      rowDiagnostics: [],
      hasDuplicateErrors: false,
      hasRateConfirmationErrors: false,
      hasDiscountErrors: false,
      hasDiscountConfirmationErrors: false,
      blockingMessage: '',
      rateWarningCount: 0,
      rateConfirmationCount: 0,
      rateAcknowledgedCount: 0,
      discountWarningCount: 0,
      discountConfirmationCount: 0,
      discountAcknowledgedCount: 0,
    },
    totals: orderTotals,
  };
  const resolvedActiveItemIndex = items[activeItemIndex] ? activeItemIndex : 0;
  const distributorById = new Map(
    (Array.isArray(distributors) ? distributors : []).map((entry) => [
      String(entry?.id || ''),
      entry,
    ])
  );
  const activeSuppliers = (Array.isArray(suppliers) ? suppliers : [])
    .filter((supplier) => supplier?.is_active !== false)
    .map((supplier) => ({
      ...supplier,
      distributor_name: distributorById.get(String(supplier?.distributor_id || ''))?.name || '',
    }))
    .filter((supplier) => {
      const distributor = distributorById.get(String(supplier?.distributor_id || ''));
      return distributor && distributor.status === 'active';
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const draftDiagnostics = draftProjection.diagnostics;
  const productLookupById = useMemo(() => {
    const map = new Map();
    [
      ...(Array.isArray(orderProductOptions?.prioritized) ? orderProductOptions.prioritized : []),
      ...(Array.isArray(orderProductOptions?.all) ? orderProductOptions.all : []),
    ].forEach((product) => {
      const productId = String(product?.id || '').trim();
      if (!productId || map.has(productId)) return;
      map.set(productId, product);
    });
    return map;
  }, [orderProductOptions]);
  const visibleOrderRows = useMemo(
    () =>
      draftProjection.rows
        .map((row, index) => {
          const item = row?.item || {};
          return {
            index,
            row,
            item,
            line: row?.line || {},
            product: productLookupById.get(String(item?.product_id || '').trim()) || null,
            diagnostics: draftDiagnostics.rowDiagnostics[index] || {},
          };
        })
        .filter((entry) => isSupplierDefaultItem(entry.item) || hasMeaningfulDraftRow(entry.item)),
    [draftDiagnostics.rowDiagnostics, draftProjection.rows, productLookupById]
  );
  const normalizedItemProductSearch = String(deferredItemProductSearch || '')
    .trim()
    .toLowerCase();
  const filteredOrderRows = useMemo(() => {
    if (!normalizedItemProductSearch) return visibleOrderRows;
    return visibleOrderRows.filter((entry) =>
      getPurchaseOrderRowProductSearchText(entry).includes(normalizedItemProductSearch)
    );
  }, [normalizedItemProductSearch, visibleOrderRows]);
  const displayedOrderRows = useMemo(() => {
    if (!itemProductSortDirection) return filteredOrderRows;
    const directionMultiplier = itemProductSortDirection === 'descending' ? -1 : 1;
    return [...filteredOrderRows].sort((left, right) => {
      const comparison = getPurchaseOrderRowProductSortLabel(left).localeCompare(
        getPurchaseOrderRowProductSortLabel(right),
        undefined,
        { numeric: true, sensitivity: 'base' }
      );

      if (comparison !== 0) {
        return comparison * directionMultiplier;
      }

      return left.index - right.index;
    });
  }, [filteredOrderRows, itemProductSortDirection]);
  const selectedRowsPageCount = Math.max(
    1,
    Math.ceil(displayedOrderRows.length / PO_SELECTED_ROW_PAGE_SIZE)
  );
  const selectedRowsPageIndexResolved = Math.max(
    0,
    Math.min(selectedRowsPageIndex, selectedRowsPageCount - 1)
  );
  const selectedRowsPageStart = selectedRowsPageIndexResolved * PO_SELECTED_ROW_PAGE_SIZE;
  const selectedRowsPageEnd = Math.min(
    displayedOrderRows.length,
    selectedRowsPageStart + PO_SELECTED_ROW_PAGE_SIZE
  );
  const selectedRowsPageRows = displayedOrderRows.slice(selectedRowsPageStart, selectedRowsPageEnd);
  const selectedRowsPageLabel = `${selectedRowsPageIndexResolved + 1}/${selectedRowsPageCount}`;
  const reviewableOrderRows = useMemo(
    () => visibleOrderRows.filter((entry) => Number(entry?.item?.quantity || 0) > 0),
    [visibleOrderRows]
  );
  const reviewQuantityTotal = useMemo(
    () =>
      reviewableOrderRows.reduce(
        (sum, entry) => sum + Math.max(0, Number(entry?.item?.quantity || 0) || 0),
        0
      ),
    [reviewableOrderRows]
  );
  const reviewSheetRows = useMemo(
    () =>
      reviewableOrderRows.map((entry, index) => {
        const rowItem = entry?.item || {};
        const rowLine = entry?.line || {};
        return {
          key: `review-row-${index}-${rowItem?.product_id || rowItem?.product_query || 'draft'}`,
          name: String(
            rowItem?.product_name || rowItem?.product_query || `Row ${index + 1}`
          ).trim(),
          quantity: Math.max(0, Number(rowLine?.quantity || rowItem?.quantity || 0) || 0),
          uom: String(rowLine?.uom || rowItem?.uom || 'pcs').trim() || 'pcs',
          rate: Number(rowItem?.rate ?? rowItem?.unit_price ?? 0) || 0,
          gstRate: Number(rowLine?.gstRate ?? rowItem?.gst_rate ?? 0) || 0,
          discountType: rowLine?.discountType || rowItem?.discount_type || 'percent',
          discountValue: Number(rowLine?.discountValue ?? rowItem?.discount_value ?? 0) || 0,
          total: Number(rowLine?.totalAmount || 0) || 0,
        };
      }),
    [reviewableOrderRows]
  );
  const reviewDisplayPages = useMemo(
    () => splitPurchaseCreateReviewRows(reviewSheetRows),
    [reviewSheetRows]
  );
  const supplierBoardItemCount = useMemo(
    () =>
      visibleOrderRows.reduce(
        (sum, entry) => (isSupplierDefaultItem(entry?.item || {}) ? sum + 1 : sum),
        0
      ),
    [visibleOrderRows]
  );
  const existingOrderProductIds = useMemo(
    () =>
      new Set(
        visibleOrderRows
          .map((entry) => String(entry?.item?.product_id || '').trim())
          .filter(Boolean)
      ),
    [visibleOrderRows]
  );
  const registeredSupplierProductIds = useMemo(
    () =>
      new Set(
        (Array.isArray(supplierRegisteredProducts) ? supplierRegisteredProducts : [])
          .map((product) => String(product?.product_id || product?.id || '').trim())
          .filter(Boolean)
      ),
    [supplierRegisteredProducts]
  );
  const productPickerProducts = useMemo(() => {
    const prioritized = Array.isArray(orderProductOptions?.prioritized)
      ? orderProductOptions.prioritized
      : [];
    const all = Array.isArray(orderProductOptions?.all) ? orderProductOptions.all : [];
    const seen = new Set();
    return [...prioritized, ...all].filter((product) => {
      const productId = String(product?.id || '').trim();
      if (!productId || seen.has(productId)) return false;
      seen.add(productId);
      if (product?.is_active === false || Number(product?.is_active || 1) === 0) return false;
      return true;
    });
  }, [orderProductOptions]);
  const filteredProductPickerProducts = useMemo(() => {
    const query = String(deferredProductPickerSearch || '')
      .trim()
      .toLowerCase();
    if (!query) return productPickerProducts;
    return productPickerProducts.filter((product) => {
      const candidates = [
        product?.name,
        product?.sku,
        product?.barcode,
        product?.brand,
        product?.category,
      ];
      return candidates.some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(query)
      );
    });
  }, [deferredProductPickerSearch, productPickerProducts]);
  const selectablePickerProductsById = useMemo(() => {
    const map = new Map();
    productPickerProducts.forEach((product) => {
      const productId = String(product?.id || '').trim();
      if (!productId || map.has(productId)) return;
      map.set(productId, product);
    });
    return map;
  }, [productPickerProducts]);
  const availableAllProductPickerProducts = useMemo(
    () =>
      productPickerProducts.filter((product) => {
        const productId = String(product?.id || '').trim();
        if (!productId) return false;
        if (existingOrderProductIds.has(productId)) return false;
        if (registeredSupplierProductIds.has(productId)) return false;
        return true;
      }),
    [existingOrderProductIds, productPickerProducts, registeredSupplierProductIds]
  );
  const filteredAllProductPickerProducts = useMemo(
    () =>
      filteredProductPickerProducts.filter((product) => {
        const productId = String(product?.id || '').trim();
        if (!productId) return false;
        if (existingOrderProductIds.has(productId)) return false;
        if (registeredSupplierProductIds.has(productId)) return false;
        return true;
      }),
    [existingOrderProductIds, filteredProductPickerProducts, registeredSupplierProductIds]
  );
  const visibleProductPickerProducts = useMemo(
    () => filteredAllProductPickerProducts.slice(0, productPickerVisibleLimit),
    [filteredAllProductPickerProducts, productPickerVisibleLimit]
  );
  const canLoadMorePickerProducts =
    productPickerVisibleLimit < filteredAllProductPickerProducts.length;
  const formTitle = editingOrderId ? 'Edit Purchase Order' : 'Create Purchase Order';
  const formSubtitle = '';
  const closeButtonLabel = inline ? 'Reset Form' : 'Cancel';
  const supplierSelected = Boolean(String(orderFormData?.supplier_id || '').trim());
  const distributorSelected =
    supplierSelected || Boolean(String(orderFormData?.distributor_id || '').trim());
  const hasMeaningfulItems = reviewableOrderRows.length > 0;
  const canReviewOrder = distributorSelected && reviewableOrderRows.length > 0 && !orderSubmitting;
  const activeWizardStep = orderReviewMode
    ? ORDER_FLOW_REVIEW_STEP
    : Math.max(0, Math.min(mobileStep, ORDER_FLOW_REVIEW_STEP - 1));
  const supplierOnlyStep = !orderReviewMode && activeWizardStep === 0 && !distributorSelected;
  const itemsWorkspaceStep = !orderReviewMode && activeWizardStep === 1;
  const reviewWorkspaceStep = orderReviewMode;
  const poWindowInactive = productPickerOpen || quickProductFormOpen;
  const modalInitialSize = supplierOnlyStep
    ? { width: Math.min(poModalSize.width, 620), height: 360 }
    : {
        width: Math.min(poModalSize.width, 1120),
        height: orderReviewMode
          ? 760
          : activeWizardStep === 1
            ? productPickerOpen
              ? 860
              : 780
            : 700,
      };
  const trimmedProductPickerSearch = String(productPickerSearch || '').trim();
  const hasProductPickerSearch = trimmedProductPickerSearch.length > 0;
  const productPickerVisibleCount = filteredAllProductPickerProducts.length;
  const productPickerAvailableCount = availableAllProductPickerProducts.length;
  const productPickerStatusLabel = loadingDistributorItems
    ? 'Loading'
    : hasProductPickerSearch
      ? `${productPickerVisibleCount} match${productPickerVisibleCount === 1 ? '' : 'es'}`
      : `${productPickerAvailableCount} left`;

  const focusSupplierField = useCallback((select = false) => {
    const target = distributorInputRef.current;
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.focus();
      if (select && typeof target.select === 'function') target.select();
    });
  }, []);
  const focusQuantityField = useCallback(
    (rowIndex) => {
      const attemptFocus = (shouldRetry = false) => {
        const target = quantityInputRefs.current[rowIndex];
        if (target) {
          window.requestAnimationFrame(() => {
            target.focus();
            if (typeof target.select === 'function') target.select();
          });
          return;
        }
        if (shouldRetry) return;
        window.requestAnimationFrame(() => attemptFocus(true));
      };

      attemptFocus(false);
    },
    [displayedOrderRows]
  );

  const isWizardStepUnlocked = useCallback(
    (stepIndex) => {
      if (stepIndex <= 0) return true;
      if (!distributorSelected) return false;
      if (stepIndex >= ORDER_FLOW_REVIEW_STEP) return orderReviewMode;
      return stepIndex === 1;
    },
    [distributorSelected, orderReviewMode]
  );

  const focusWorkflowStep = useCallback(
    (stepIndex) => {
      if (!isWizardStepUnlocked(stepIndex)) {
        if (!distributorSelected) {
          focusSupplierField(true);
        }
        return;
      }

      if (stepIndex === 0) {
        setMobileStep(0);
        focusSupplierField(true);
        return;
      }

      if (stepIndex === 1) {
        setMobileStep(1);
        return;
      }

      if (stepIndex === ORDER_FLOW_REVIEW_STEP && orderReviewMode) {
        setMobileStep(ORDER_FLOW_REVIEW_STEP);
        window.requestAnimationFrame(() => {
          formFooterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          submitButtonRef.current?.focus();
        });
      }
    },
    [distributorSelected, focusSupplierField, isWizardStepUnlocked, orderReviewMode]
  );

  const handleAdvanceWorkflow = useCallback(() => {
    if (activeWizardStep === 0) {
      if (!distributorSelected) {
        focusSupplierField(true);
        return;
      }
      focusWorkflowStep(1);
      return;
    }
    if (activeWizardStep === 1) {
      if (!hasMeaningfulItems) {
        return;
      }
      const opened = handleOpenOrderReview();
      if (opened) {
        setMobileStep(ORDER_FLOW_REVIEW_STEP);
      }
    }
  }, [
    activeWizardStep,
    distributorSelected,
    hasMeaningfulItems,
    focusSupplierField,
    focusWorkflowStep,
    handleOpenOrderReview,
  ]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return undefined;
    if (orderReviewMode) {
      setMobileStep(ORDER_FLOW_REVIEW_STEP);
    } else if (!String(orderFormData?.distributor_id || '').trim()) {
      setMobileStep(0);
    } else {
      setMobileStep(1);
    }
    setActiveItemIndex(0);
    setSelectedRowsPageIndex(0);
    setProductPickerOpen(false);
    setProductPickerSearch('');
    setProductPickerSelectedIds([]);
    setItemProductSearch('');
    setItemProductSortDirection(null);
    previousDistributorIdRef.current = String(orderFormData?.distributor_id || '').trim();
    const frameId = window.requestAnimationFrame(() => {
      if (orderReviewMode) {
        submitButtonRef.current?.focus();
        return;
      }
      if (String(orderFormData?.distributor_id || '').trim()) {
        return;
      }
      focusSupplierField(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [open, focusSupplierField, orderFormData?.distributor_id, orderReviewMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (!items.length) {
      setActiveItemIndex(0);
      return;
    }
    if (resolvedActiveItemIndex !== activeItemIndex) {
      setActiveItemIndex(resolvedActiveItemIndex);
    }
  }, [activeItemIndex, items.length, open, resolvedActiveItemIndex]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    const previousDistributorId = previousDistributorIdRef.current;
    const nextDistributorId = String(orderFormData?.distributor_id || '').trim();
    if (!nextDistributorId) {
      setMobileStep(0);
      setSelectedRowsPageIndex(0);
      setProductPickerOpen(false);
      setProductPickerSearch('');
      setProductPickerSelectedIds([]);
      setItemProductSearch('');
      previousDistributorIdRef.current = nextDistributorId;
      return;
    }
    if (previousDistributorId !== nextDistributorId) {
      setMobileStep(1);
      setSelectedRowsPageIndex(0);
      setProductPickerOpen(false);
      setProductPickerSearch('');
      setProductPickerSelectedIds([]);
      setItemProductSearch('');
    }
    previousDistributorIdRef.current = nextDistributorId;
  }, [open, orderFormData?.distributor_id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (orderReviewMode) {
      setMobileStep(ORDER_FLOW_REVIEW_STEP);
      return;
    }
    setMobileStep((current) => {
      if (!distributorSelected) return 0;
      if (current >= ORDER_FLOW_REVIEW_STEP) return 1;
      return current;
    });
  }, [distributorSelected, open, orderReviewMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    const nextType = resolveDiscountColumnType(items);
    setDiscountColumnType((current) => (current === nextType ? current : nextType));
  }, [items, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeWizardStep !== 1 || orderReviewMode) {
      setProductPickerOpen(false);
      setProductPickerSelectedIds([]);
      setProductPickerSearch('');
    }
  }, [activeWizardStep, orderReviewMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!productPickerOpen) return;
    setProductPickerVisibleLimit(productPickerPageSize);
  }, [
    deferredProductPickerSearch,
    productPickerOpen,
    productPickerPageSize,
    filteredAllProductPickerProducts.length,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSelectedRowsPageIndex(0);
  }, [displayedOrderRows.length, itemProductSearch, itemProductSortDirection]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!productPickerOpen) return undefined;
    const rootNode = productPickerScrollRef.current;
    const sentinel = productPickerLoadMoreRef.current;
    if (!sentinel || !canLoadMorePickerProducts) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setProductPickerVisibleLimit((current) =>
          Math.min(current + productPickerPageSize, filteredAllProductPickerProducts.length)
        );
      },
      {
        root: rootNode || null,
        rootMargin: '200px',
        threshold: 0.01,
      }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    canLoadMorePickerProducts,
    filteredAllProductPickerProducts.length,
    productPickerOpen,
    productPickerPageSize,
  ]);

  const handleRemoveRow = useCallback(
    (index = resolvedActiveItemIndex) => {
      const nextIndex = Math.max(0, Math.min(index, items.length - 2));
      const nextPageIndex = Math.max(0, Math.floor(nextIndex / PO_SELECTED_ROW_PAGE_SIZE));
      handleOrderItemRemove(index);
      setActiveItemIndex(nextIndex);
      setSelectedRowsPageIndex(nextPageIndex);
      setMobileStep(1);
    },
    [handleOrderItemRemove, items.length, resolvedActiveItemIndex]
  );

  const moveDisplayedRowFocus = useCallback(
    (rowIndex, direction = 1) => {
      const currentPosition = displayedOrderRows.findIndex((entry) => entry.index === rowIndex);
      if (currentPosition < 0) return;
      const nextPosition =
        direction < 0
          ? Math.max(0, currentPosition - 1)
          : Math.min(displayedOrderRows.length - 1, currentPosition + 1);
      const nextIndex = displayedOrderRows[nextPosition]?.index;
      if (typeof nextIndex !== 'number') return;
      setSelectedRowsPageIndex(Math.max(0, Math.floor(nextPosition / PO_SELECTED_ROW_PAGE_SIZE)));
      setActiveItemIndex(nextIndex);
      focusQuantityField(nextIndex);
    },
    [displayedOrderRows, focusQuantityField]
  );

  const handleSelectedRowsPageChange = useCallback(
    (nextPageIndex) => {
      const nextIndex = Math.max(
        0,
        Math.min(Math.floor(nextPageIndex), selectedRowsPageCount - 1)
      );
      const nextPageStart = nextIndex * PO_SELECTED_ROW_PAGE_SIZE;
      const nextRow = displayedOrderRows[nextPageStart];
      setSelectedRowsPageIndex(nextIndex);
      if (typeof nextRow?.index === 'number') {
        setActiveItemIndex(nextRow.index);
        focusQuantityField(nextRow.index);
      }
    },
    [displayedOrderRows, focusQuantityField, selectedRowsPageCount]
  );

  const toggleProductPickerSelection = useCallback(
    (productId) => {
      const normalizedProductId = String(productId || '').trim();
      if (!normalizedProductId) return;
      if (existingOrderProductIds.has(normalizedProductId)) return;
      setProductPickerSelectedIds((prev) =>
        prev.includes(normalizedProductId)
          ? prev.filter((entry) => entry !== normalizedProductId)
          : [...prev, normalizedProductId]
      );
    },
    [existingOrderProductIds]
  );

  const handleOpenProductPicker = useCallback(() => {
    if (!distributorSelected) {
      focusWorkflowStep(0);
      return;
    }
    setProductPickerOpen(true);
    setProductPickerSearch('');
    setProductPickerSelectedIds([]);
  }, [distributorSelected, focusWorkflowStep]);

  const handleCloseProductPicker = useCallback(() => {
    setProductPickerOpen(false);
    setProductPickerSelectedIds([]);
    setProductPickerSearch('');
  }, []);

  const handleProductPickerSearchChange = useCallback(
    (event) => {
      if (!distributorSelected) {
        focusWorkflowStep(0);
        return;
      }
      setProductPickerOpen(true);
      setProductPickerSearch(event.target.value);
    },
    [distributorSelected, focusWorkflowStep]
  );

  const handleApplySelectedProducts = useCallback(async () => {
    const selectedProducts = productPickerSelectedIds
      .map((productId) => selectablePickerProductsById.get(productId))
      .filter(Boolean);
    if (!selectedProducts.length) {
      handleCloseProductPicker();
      return;
    }
    await handleApplyCatalogProducts(selectedProducts);
    handleCloseProductPicker();
    setMobileStep(1);
  }, [
    handleApplyCatalogProducts,
    handleCloseProductPicker,
    productPickerSelectedIds,
    selectablePickerProductsById,
  ]);

  const handleOpenProductsCatalog = useCallback(() => {
    setQuickProductFormOpen(true);
  }, []);

  const handleItemProductSearchChange = useCallback((event) => {
    setItemProductSearch(event.target.value);
  }, []);

  const handleItemProductSortToggle = useCallback(() => {
    setItemProductSortDirection((current) => getNextPurchaseOrderRowSortDirection(current));
  }, []);

  const handleCloseQuickProductForm = useCallback(() => {
    setQuickProductFormOpen(false);
  }, []);

  const handleQuickProductSaved = useCallback(async (saveResult = {}) => {
    const savedProducts = Array.isArray(saveResult?.savedProducts)
      ? saveResult.savedProducts
      : Array.isArray(saveResult?.createdProducts)
        ? saveResult.createdProducts
        : saveResult?.updatedProduct
          ? [saveResult.updatedProduct]
          : [];
    const primarySavedProduct = savedProducts[0] || null;
    const nextPickerSearch = String(
      primarySavedProduct?.name || primarySavedProduct?.sku || ''
    ).trim();
    const nextSelectedProductId = String(primarySavedProduct?.id || '').trim();

    setQuickProductFormOpen(false);
    setProductPickerOpen(true);

    // Invalidate the purchase lookup cache and refresh products
    try {
      const cacheKey = 'purchase_lookup_cache_v1';
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(cacheKey);
      }

      // Refresh products data by calling the API directly
      if (onRefreshProducts) {
        await onRefreshProducts();
      }
    } catch (error) {
      console.warn('Failed to refresh products after adding new product:', error);
    } finally {
      if (nextPickerSearch) {
        setProductPickerSearch(nextPickerSearch);
      }
      if (nextSelectedProductId) {
        setProductPickerSelectedIds([nextSelectedProductId]);
      }
    }
  }, [onRefreshProducts]);

  const handleSubmitProductPicker = useCallback(() => {
    if (orderSubmitting || productPickerSelectedIds.length === 0) return;
    void handleApplySelectedProducts();
  }, [handleApplySelectedProducts, orderSubmitting, productPickerSelectedIds.length]);

  const handleProductPickerKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Enter') return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      handleSubmitProductPicker();
    },
    [handleSubmitProductPicker]
  );

  const handleFormSubmit = useCallback((event) => {
    event.preventDefault();
  }, []);
  const handleFinalSubmitClick = useCallback(
    (event) => {
      event.preventDefault();
      handleOrderSubmit(event);
    },
    [handleOrderSubmit]
  );
  const handleQuantityFieldKeyDown = useCallback(
    (rowIndex, quantityStep) => (event) => {
      const integerOnly = Number.isFinite(quantityStep) && Number.isInteger(Number(quantityStep));
      if (integerOnly && ['e', 'E', '.', ','].includes(event.key)) {
        event.preventDefault();
        return;
      }
      if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const direction =
        event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1;
      moveDisplayedRowFocus(rowIndex, direction);
    },
    [moveDisplayedRowFocus]
  );
  const handleQuantityFieldBlur = useCallback(
    (rowIndex, quantityStep) => (event) => {
      const integerOnly = Number.isFinite(quantityStep) && Number.isInteger(Number(quantityStep));
      if (!integerOnly) return;
      const parsedValue = Number(event.target.value);
      if (!Number.isFinite(parsedValue)) return;
      const normalizedValue = Math.max(0, Math.trunc(parsedValue));
      if (parsedValue !== normalizedValue) {
        handleOrderItemChange(rowIndex, 'quantity', normalizedValue);
      }
    },
    [handleOrderItemChange]
  );
  const handleInlineFieldKeyDown = useCallback(
    (rowIndex) => (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      moveDisplayedRowFocus(rowIndex, event.shiftKey ? -1 : 1);
    },
    [moveDisplayedRowFocus]
  );
  const handleDiscountColumnToggle = useCallback(() => {
    const nextType = discountColumnType === 'fixed' ? 'percent' : 'fixed';
    const hasDiscountValues = items.some((item) => Number(item?.discount_value || 0) > 0);
    if (hasDiscountValues && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `Switching discount mode to ${nextType === 'fixed' ? 'fixed amount (₹)' : 'percentage (%)'} will reset all discounts. Continue?`
      );
      if (!confirmed) return;
    }
    setOrderFormData((prev) => {
      const nextItems = Array.isArray(prev?.items)
        ? prev.items.map((item) => ({
            ...item,
            discount_type: nextType,
            discount_value: 0,
            discount_warning_acknowledged: false,
          }))
        : [];
      return { ...prev, items: nextItems };
    });
    setDiscountColumnType(nextType);
  }, [discountColumnType, items, setOrderFormData]);
  const handleDiscountValueChange = useCallback(
    (rowIndex) => (event) => {
      const nextValue = event.target.value;
      if (normalizeDiscountColumnType(items[rowIndex]?.discount_type) !== discountColumnType) {
        handleOrderItemChange(rowIndex, 'discount_type', discountColumnType);
      }
      handleOrderItemChange(rowIndex, 'discount_value', nextValue);
    },
    [discountColumnType, handleOrderItemChange, items]
  );

  if (!open) return null;

  const canSubmitOrder = orderReviewMode && canReviewOrder;
  const reviewActionLabel = editingOrderId ? 'Review Update' : 'Review';
  const finalSubmitLabel = editingOrderId ? 'Confirm Update' : 'Confirm PO';
  const stepPrimaryActionLabel = orderReviewMode
    ? finalSubmitLabel
    : activeWizardStep === 0
      ? 'Continue to Items'
      : reviewActionLabel;
  const stepPrimaryActionDisabled = orderReviewMode
    ? !canSubmitOrder
    : activeWizardStep === 0
      ? !distributorSelected || orderSubmitting
      : !canReviewOrder || orderSubmitting;
  const handleBackFromReview = () => {
    closeOrderReview();
    setMobileStep(1);
  };
  const handleModalClose = () => {
    if (orderReviewMode) {
      handleBackFromReview();
      return;
    }
    closeOrderForm();
  };

  const content = (
    <div
      ref={poModalRef}
      className={inline ? 'po-entry-inline-shell' : 'po-entry-workspace-shell'}
      style={inline ? undefined : { width: '100%', height: '100%' }}
    >
      <form
        onSubmit={handleFormSubmit}
        className={[
          'po-entry-form',
          'po-entry-view-form',
          !inline ? 'fullscreen-workspace' : '',
          supplierOnlyStep ? 'supplier-step' : '',
          itemsWorkspaceStep ? 'items-workspace' : '',
          reviewWorkspaceStep ? 'review-workspace' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        noValidate
      >
        <div className="po-invoice-preview po-entry-preview">
          {savedOrderDrafts.length && activeWizardStep === 0 && !orderReviewMode ? (
            <section className="po-saved-draft-shelf">
              <div className="po-saved-draft-shelf-head">
                <div>
                  <strong>Saved Drafts</strong>
                  <p>Open, edit, and finalise later.</p>
                </div>
                <span className="po-pos-status-chip neutral">{savedOrderDrafts.length}</span>
              </div>
              <div className="po-saved-draft-list" role="list" aria-label="Saved purchase drafts">
                {savedOrderDrafts.map((draft) => (
                  <article
                    key={draft.id}
                    className={`po-saved-draft-card${activeSavedOrderDraftId === draft.id ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="po-saved-draft-main"
                      onClick={() => openSavedOrderDraft(draft.id)}
                    >
                      <strong>{draft.title}</strong>
                      <small>{draft.supplierName || 'No supplier selected yet'}</small>
                      <small>
                        {draft.itemCount} item{draft.itemCount === 1 ? '' : 's'} • Total{' '}
                        {formatReviewAmount(draft.totalAmount || 0)}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="po-saved-draft-remove"
                      onClick={() => deleteSavedOrderDraft(draft.id)}
                      aria-label={`Delete ${draft.title}`}
                    >
                      Remove
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!orderReviewMode && activeWizardStep === 0 ? (
            <section
              className={`po-popup-supplier-stage${supplierOnlyStep ? ' supplier-focus' : ''}`}
            >
              <div
                className={`po-party-grid${supplierOnlyStep ? ' po-supplier-focus-grid' : ' po-entry-header-grid'}`}
              >
                <PurchaseDistributorSelector
                  activeSuppliers={activeSuppliers}
                  orderFormData={orderFormData}
                  handleDistributorInputChange={handleDistributorInputChange}
                  distributorInputRef={distributorInputRef}
                />
              </div>
            </section>
          ) : null}

          {!orderReviewMode && activeWizardStep === 1 ? (
            <div
              className={`po-popup-items-screen single-flow${productPickerOpen ? ' picker-open' : ''}`}
            >
              <section className="po-popup-items-head">
                <div className="po-popup-items-head-copy">
                  <strong>
                    {String(
                      orderFormData?.supplier_name || orderFormData?.distributor_name || ''
                    ).trim() || 'Supplier selected'}
                  </strong>
                  <button
                    type="button"
                    className="po-popup-supplier-switch"
                    onClick={() => focusWorkflowStep(0)}
                    disabled={orderSubmitting}
                    aria-label="Change supplier"
                    title="Change supplier"
                  >
                    <ArrowUpDown size={14} aria-hidden="true" />
                  </button>
                </div>
                <div className="po-popup-items-head-actions">
                  <button
                    type="button"
                    className="po-popup-supplier-switch po-popup-add-product"
                    onClick={handleOpenProductPicker}
                    disabled={orderSubmitting}
                    aria-label="Add product"
                    title="Add product"
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                  <span
                    className="po-popup-board-count"
                    aria-label={
                      normalizedItemProductSearch
                        ? `${displayedOrderRows.length} shown out of ${visibleOrderRows.length}`
                        : `${supplierBoardItemCount} supplier rows and ${reviewableOrderRows.length} ordered`
                    }
                  >
                    <Layers size={14} aria-hidden="true" />
                    <strong>
                      {normalizedItemProductSearch
                        ? `${displayedOrderRows.length}/${visibleOrderRows.length}`
                        : `${supplierBoardItemCount}`}
                    </strong>
                  </span>
                  {selectedRowsPageCount > 1 ? (
                    <div className="po-popup-board-pagination">
                      <button
                        type="button"
                        className="po-popup-inline-action po-popup-page-nav"
                        onClick={() => handleSelectedRowsPageChange(selectedRowsPageIndexResolved - 1)}
                        disabled={orderSubmitting || selectedRowsPageIndexResolved <= 0}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="po-popup-page-pill">{selectedRowsPageLabel}</span>
                      <button
                        type="button"
                        className="po-popup-inline-action po-popup-page-nav"
                        onClick={() => handleSelectedRowsPageChange(selectedRowsPageIndexResolved + 1)}
                        disabled={
                          orderSubmitting || selectedRowsPageIndexResolved >= selectedRowsPageCount - 1
                        }
                        aria-label="Next page"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="po-popup-selected-panel full-width">
                {displayedOrderRows.length ? (
                  <div className="po-popup-items-table">
                    <div className="po-popup-items-table-head">
                      <div className="po-popup-product-header">
                        <button
                          type="button"
                          className="po-popup-column-toggle po-popup-product-sort-toggle"
                          onClick={handleItemProductSortToggle}
                          disabled={orderSubmitting}
                          title={
                            itemProductSortDirection
                              ? `Sort rows by Product, currently ${itemProductSortDirection}`
                              : 'Sort rows by Product'
                          }
                          aria-label={
                            itemProductSortDirection
                              ? `Sort rows by Product, currently ${itemProductSortDirection}`
                              : 'Sort rows by Product'
                          }
                          aria-sort={itemProductSortDirection || 'none'}
                        >
                          <span>Product</span>
                          <span className="po-popup-sort-icon" aria-hidden="true">
                            {itemProductSortDirection === 'ascending' ? (
                              <ArrowUp size={13} />
                            ) : itemProductSortDirection === 'descending' ? (
                              <ArrowDown size={13} />
                            ) : (
                              <ArrowUpDown size={13} />
                            )}
                          </span>
                        </button>
                        <label
                          className="po-popup-product-search"
                          htmlFor="po-popup-item-product-search"
                        >
                          <Search size={12} aria-hidden="true" />
                          <input
                            id="po-popup-item-product-search"
                            type="search"
                            value={itemProductSearch}
                            onChange={handleItemProductSearchChange}
                            placeholder="Search row"
                            aria-label="Search loaded item rows by product name or SKU"
                            disabled={orderSubmitting}
                          />
                        </label>
                      </div>
                      <span>Qty</span>
                      <span>Unit</span>
                      <span>Rate</span>
                      <span>GST</span>
                      <button
                        type="button"
                        className="po-popup-column-toggle"
                        onClick={handleDiscountColumnToggle}
                        disabled={orderSubmitting}
                        title="Switching discount mode resets all row discounts."
                        aria-label={`Switch discount column mode. Current mode ${getDiscountColumnLabel(discountColumnType)}`}
                      >
                        {getDiscountColumnLabel(discountColumnType)}
                      </button>
                      <span>Total</span>
                    </div>
                    <div className="po-popup-items-table-body">
                      {selectedRowsPageRows.length ? (
                        selectedRowsPageRows.map(({ index, item, line, product, diagnostics }) => {
                          const productSku = String(product?.sku || item?.sku || '').trim();
                          const displayName = String(
                            item?.product_name ||
                              item?.product_query ||
                              product?.name ||
                              `Row ${index + 1}`
                          ).trim();
                          const displayTitle = productSku
                            ? `${displayName} (SKU: ${productSku})`
                            : displayName;
                          const rowUom = String(line?.uom || item?.uom || 'pcs').trim() || 'pcs';
                          const itemUomOptions = getAllowedPurchaseUnitsForProduct(product);
                          const rowIssue = getDraftRowIssue(diagnostics);
                          const gstRate = Number(item?.gst_rate ?? line?.gstRate ?? 0) || 0;
                          const quantityStep = getPurchasePackStep(product, rowUom);
                          const currentRate = Number(item?.rate ?? item?.unit_price ?? 0) || 0;
                          const seededRate =
                            Number(
                              item?.last_purchase_rate ||
                                item?.auto_fill_seed_rate ||
                                item?.reference_rate ||
                                item?.rate ||
                                0
                            ) || 0;
                          const hasEditedRate =
                            seededRate > 0 && Math.abs(currentRate - seededRate) > 0.001;
                          const isActiveRow = activeItemIndex === index;
                          const quantityValue = Math.max(0, Number(item?.quantity || 0) || 0);
                          const rowLocked = isSupplierDefaultItem(item);
                          const rowIsZero = quantityValue <= 0;
                          const rowMetaNote = [
                            rowIssue && rowIssue.text ? rowIssue.text : '',
                            !rowIssue && hasEditedRate ? 'edited' : '',
                          ]
                            .filter(Boolean)
                            .join(' • ');
                          return (
                            <article
                              key={`selected-po-row-${index}`}
                              className={`po-popup-items-table-row selected${isActiveRow ? ' active' : ''}${rowLocked ? ' locked' : ''}${rowIsZero ? ' zero' : ''}`}
                            >
                              <div className="po-popup-grid-product">
                                <SafeProductImage
                                  product={
                                    product || {
                                      name: displayTitle,
                                      image: item?.image || item?.image_url || '',
                                    }
                                  }
                                  alt={displayTitle}
                                  className="po-popup-grid-image"
                                />
                                <div className="po-popup-grid-product-copy">
                                  <strong>{displayTitle}</strong>
                                  {rowMetaNote ? <small>{rowMetaNote}</small> : null}
                                </div>
                              </div>
                              <div className="po-popup-grid-cell po-popup-grid-cell-qty">
                                <input
                                  ref={(node) => {
                                    if (node) {
                                      quantityInputRefs.current[index] = node;
                                    } else {
                                      delete quantityInputRefs.current[index];
                                    }
                                  }}
                                  type="number"
                                  min="0"
                                  step={quantityStep}
                                  inputMode={Number.isInteger(quantityStep) ? 'numeric' : 'decimal'}
                                  value={item?.quantity ?? ''}
                                  onChange={(event) =>
                                    handleOrderItemChange(index, 'quantity', event.target.value)
                                  }
                                  onFocus={() => setActiveItemIndex(index)}
                                  onKeyDown={handleQuantityFieldKeyDown(index, quantityStep)}
                                  onBlur={handleQuantityFieldBlur(index, quantityStep)}
                                  disabled={orderSubmitting}
                                  aria-label={`Quantity for ${displayTitle}`}
                                />
                              </div>
                              <div className="po-popup-grid-cell">
                                <select
                                  value={rowUom}
                                  onChange={(event) =>
                                    handleOrderItemChange(index, 'uom', event.target.value)
                                  }
                                  onFocus={() => setActiveItemIndex(index)}
                                  onKeyDown={handleInlineFieldKeyDown(index)}
                                  disabled={orderSubmitting}
                                  aria-label={`Unit for ${displayTitle}`}
                                >
                                  {itemUomOptions.map((uomOption) => (
                                    <option key={`${index}-${uomOption}`} value={uomOption}>
                                      {uomOption}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="po-popup-grid-cell">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item?.rate ?? item?.unit_price ?? ''}
                                  onChange={(event) =>
                                    handleOrderItemChange(index, 'rate', event.target.value)
                                  }
                                  onFocus={() => setActiveItemIndex(index)}
                                  onKeyDown={handleInlineFieldKeyDown(index)}
                                  disabled={orderSubmitting}
                                  aria-label={`Rate for ${displayTitle}`}
                                />
                              </div>
                              <div className="po-popup-grid-cell">
                                <select
                                  value={gstRate}
                                  onChange={(event) =>
                                    handleOrderItemChange(
                                      index,
                                      'gst_rate',
                                      toNumber(event.target.value)
                                    )
                                  }
                                  onFocus={() => setActiveItemIndex(index)}
                                  onKeyDown={handleInlineFieldKeyDown(index)}
                                  disabled={orderSubmitting}
                                  aria-label={`GST for ${displayTitle}`}
                                >
                                  {GST_RATE_OPTIONS.map((rateOption) => (
                                    <option key={`${index}-gst-${rateOption}`} value={rateOption}>
                                      {rateOption}%
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="po-popup-grid-cell po-popup-grid-cell-discount">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item?.discount_value || ''}
                                  onChange={handleDiscountValueChange(index)}
                                  onFocus={() => setActiveItemIndex(index)}
                                  onKeyDown={handleInlineFieldKeyDown(index)}
                                  disabled={orderSubmitting}
                                  aria-label={`${getDiscountColumnLabel(discountColumnType)} for ${displayTitle}`}
                                />
                                <small>{getDiscountColumnSuffix(discountColumnType)}</small>
                              </div>
                              <div className="po-popup-grid-total">
                                <div className="po-popup-grid-total-main">
                                  <strong>₹{formatReviewAmount(line?.totalAmount || 0)}</strong>
                                  <div className="po-popup-grid-total-actions">
                                    {diagnostics.rateRequiresAcknowledgement ? (
                                      <button
                                        type="button"
                                        className="po-popup-inline-action po-popup-inline-action-small"
                                        onClick={() =>
                                          handleOrderItemChange(
                                            index,
                                            'rate_warning_acknowledged',
                                            true
                                          )
                                        }
                                        disabled={orderSubmitting}
                                        title={
                                          diagnostics.rateAcknowledgementMessage ||
                                          diagnostics.rateWarningMessage ||
                                          'Accept price'
                                        }
                                        aria-label={`Accept rate for ${displayTitle}`}
                                      >
                                        ✓
                                      </button>
                                    ) : null}
                                    {diagnostics.discountRequiresAcknowledgement ? (
                                      <button
                                        type="button"
                                        className="po-popup-inline-action po-popup-inline-action-small"
                                        onClick={() =>
                                          handleOrderItemChange(
                                            index,
                                            'discount_warning_acknowledged',
                                            true
                                          )
                                        }
                                        disabled={orderSubmitting}
                                        title={
                                          diagnostics.discountAcknowledgementMessage ||
                                          diagnostics.discountWarningMessage ||
                                          'Confirm discount'
                                        }
                                        aria-label={`Confirm unusual discount for ${displayTitle}`}
                                      >
                                        ✓
                                      </button>
                                    ) : null}
                                    {!rowLocked ? (
                                      <button
                                        type="button"
                                        className="po-popup-inline-action danger"
                                        onClick={() => handleRemoveRow(index)}
                                        disabled={orderSubmitting}
                                        aria-label={`Remove ${displayTitle}`}
                                      >
                                        ✕
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })
                      ) : null}
                    </div>
                  </div>
                ) : normalizedItemProductSearch && visibleOrderRows.length ? (
                  <div className="po-popup-empty-state">
                    <strong>No matching products found.</strong>
                    <p>Try a different product name or SKU, or clear the search to see all rows.</p>
                  </div>
                ) : (
                  <div className="po-pos-empty-state">
                    <strong>
                      {loadingDistributorItems
                        ? 'Loading supplier products...'
                        : 'No supplier products are loaded yet.'}
                    </strong>
                    <p>
                      {loadingDistributorItems
                        ? 'Preparing the supplier board.'
                        : 'This supplier has no registered board items yet. Use Add Product to add extra products for this PO.'}
                    </p>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {orderReviewMode ? (
            <section className="po-review-sheet po-create-review-sheet">
              <div className="po-review-sheet-head bill">
                <div>
                  <span className="po-review-print-kicker">Purchase Order</span>
                  <h4>Review Before Final Submit</h4>
                  <p>Review the order and then do the final submit.</p>
                </div>
                <span className="po-pos-status-chip good">
                  {reviewableOrderRows.length} item
                  {reviewableOrderRows.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="po-review-print-meta">
                <div>
                  <span>Supplier:</span>
                  <strong>
                    {String(orderFormData?.supplier_name || orderFormData?.distributor_name || '')
                      .trim() || 'Not selected'}
                  </strong>
                </div>
                <div>
                  <span>Date:</span>
                  <strong>{new Date().toLocaleDateString()}</strong>
                </div>
                <div>
                  <span>Delivery:</span>
                  <strong>{String(orderFormData?.expected_delivery || '').trim() || 'Skipped'}</strong>
                </div>
              </div>

              <div className="po-create-review-pages">
                {reviewDisplayPages.map((pageRows, pageIndex) => (
                  <PurchaseCreateReviewPage
                    key={`po-create-review-page-${pageIndex}`}
                    rows={pageRows}
                    pageIndex={pageIndex}
                    totalPages={reviewDisplayPages.length}
                  />
                ))}
              </div>

              <div className="po-review-bill-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatReviewAmount(orderTotals.taxableValue || 0)}</strong>
                </div>
                <div>
                  <span>GST</span>
                  <strong>{formatReviewAmount(orderTotals.taxAmount || 0)}</strong>
                </div>
                <div className="grand">
                  <span>Total</span>
                  <strong>{formatReviewTotalAmount(orderTotals.totalAmount || 0)}</strong>
                </div>
              </div>

              <PurchaseOrderEntryControlPanel
                draftDiagnostics={draftDiagnostics}
                orderFullMode={orderFullMode}
                orderFormData={orderFormData}
                setOrderFormData={setOrderFormData}
              />

              {!reviewableOrderRows.length ? (
                <div className="po-pos-empty-state">
                  <strong>No reviewable items yet.</strong>
                  <p>
                    Return to the items step and enter quantity above zero for at least one product.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        <div
          ref={formFooterRef}
          className={`form-section po-form-section po-form-footer${supplierOnlyStep ? ' supplier-step' : ''}`}
        >
          <div className="po-form-footer-panel">
            {distributorSelected && !orderReviewMode ? (
              <PurchaseOrderSummaryPanel
                orderFullMode={orderFullMode}
                orderTotals={orderTotals}
                itemCount={reviewableOrderRows.length}
                quantityTotal={reviewQuantityTotal}
              />
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={orderReviewMode ? handleBackFromReview : closeOrderForm}
              >
                {orderReviewMode ? 'Modify' : closeButtonLabel}
              </button>
              {!orderReviewMode && distributorSelected ? (
                <button
                  type="button"
                  className="submit-btn secondary"
                  onClick={saveCurrentOrderDraft}
                  disabled={orderSubmitting}
                >
                  Save Draft
                </button>
              ) : null}
              <button
                ref={submitButtonRef}
                type="button"
                className="submit-btn"
                disabled={stepPrimaryActionDisabled}
                onClick={orderReviewMode ? handleFinalSubmitClick : handleAdvanceWorkflow}
              >
                {orderSubmitting ? 'Saving...' : stepPrimaryActionLabel}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );

  if (inline) {
    return (
      <section className="po-entry-inline-surface" aria-label={formTitle}>
        <div className="po-entry-inline-banner">
          <div>
            <h2>{formTitle}</h2>
            {formSubtitle ? <p>{formSubtitle}</p> : null}
          </div>
        </div>
        {content}
      </section>
    );
  }

  return (
    <>
      <WindowModal
        open={open}
        title={formTitle}
        subtitle={formSubtitle || undefined}
        onClose={handleModalClose}
        dismissible={!orderSubmitting}
        closeOnEscape={!orderReviewMode}
        closeOnBackdrop={false}
        themeClassName="purchase-management"
        dialogClassName={`purchase-modal-frame large po-form-modal po-entry-view-modal${poWindowInactive ? ' is-underlay' : ''}`}
        headerClassName="purchase-modal-header"
        contentClassName="purchase-modal-body purchase-modal-workspace-body"
        closeButtonClassName="purchase-modal-close-btn"
        initialSize={modalInitialSize}
        minWidth={distributorSelected || orderReviewMode ? 720 : 520}
        minHeight={distributorSelected || orderReviewMode ? 520 : 260}
        minimizable={false}
        maximizable={false}
        draggable={false}
        resizable={false}
        fullscreen
      >
        {content}
      </WindowModal>
      <WindowModal
        open={productPickerOpen}
        title="Add Products"
        subtitle=""
        onClose={handleCloseProductPicker}
        dismissible={!orderSubmitting}
        themeClassName="purchase-management"
        dialogClassName={`purchase-modal-frame po-product-picker-modal${quickProductFormOpen ? ' is-underlay' : ''}`}
        headerClassName="purchase-modal-header"
        contentClassName="purchase-modal-body"
        closeButtonClassName="purchase-modal-close-btn"
        initialSize={{ width: 960, height: 720 }}
        minWidth={640}
        minHeight={520}
        minimizable={false}
        maximizable
        draggable
        resizable
      >
        <section className="po-product-picker-panel">
          <div className="po-popup-search-bar po-product-picker-sticky">
            <label className="po-popup-search-field" htmlFor="po-popup-product-search">
              <Search size={15} />
              <input
                id="po-popup-product-search"
                type="text"
                value={productPickerSearch}
                onChange={handleProductPickerSearchChange}
                onKeyDown={handleProductPickerKeyDown}
                placeholder="Search name or SKU"
                aria-label="Search products for purchase order"
              />
            </label>
            <div className="po-popup-search-actions">
              <span
                className={`po-popup-search-status${loadingDistributorItems ? ' loading' : ''}`}
                aria-live="polite"
              >
                {productPickerStatusLabel}
              </span>
            </div>
          </div>
          <div className="po-product-picker-head po-product-picker-sticky">
            <div className="po-product-picker-headline">
              <strong>Extra Products</strong>
              <span className="po-product-picker-count">
                {hasProductPickerSearch
                  ? `${productPickerVisibleCount} shown`
                  : `${productPickerAvailableCount} left`}
              </span>
            </div>
          </div>

          <div ref={productPickerScrollRef} className="po-product-picker-scroll">
            {filteredAllProductPickerProducts.length ? (
              <div className="po-product-picker-grid" role="list" aria-label="Selectable products">
                {visibleProductPickerProducts.map((product) => {
                  const productId = String(product?.id || '').trim();
                  const isSelected = productPickerSelectedIds.includes(productId);
                  return (
                    <button
                      key={`po-picker-${productId}`}
                      type="button"
                      className={`po-product-picker-card${isSelected ? ' selected' : ''}`}
                      onClick={() => toggleProductPickerSelection(productId)}
                    >
                      <SafeProductImage
                        product={product}
                        alt={product?.name || 'Product'}
                        className="po-product-picker-card-image"
                      />
                      <div className="po-product-picker-card-copy">
                        <strong>{String(product?.name || 'Product').trim()}</strong>
                        <small>{product?.sku ? `SKU ${String(product?.sku).trim()}` : 'Catalog item'}</small>
                      </div>
                      <span
                        className={`po-product-picker-card-state${isSelected ? ' selected' : ''}`}
                        aria-hidden="true"
                      >
                        {isSelected ? <Check size={13} /> : <Plus size={13} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="po-pos-empty-state">
                <strong>
                  {availableAllProductPickerProducts.length
                    ? 'No matches.'
                    : 'No extra products left.'}
                </strong>
                <p>
                  {availableAllProductPickerProducts.length
                    ? 'Try a different name or SKU.'
                    : 'All extra catalog items are already loaded.'}
                </p>
              </div>
            )}
            {canLoadMorePickerProducts ? (
              <div
                ref={productPickerLoadMoreRef}
                className="po-product-picker-load-more"
                aria-hidden="true"
              />
            ) : null}
          </div>
          <div className="po-product-picker-actions po-product-picker-sticky-bottom">
            <button
              type="button"
              className="po-popup-inline-action"
              onClick={handleOpenProductsCatalog}
              disabled={orderSubmitting}
            >
              New Product
            </button>
            <button
              type="button"
              className="po-popup-inline-action"
              onClick={handleCloseProductPicker}
              disabled={orderSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="po-icon-action-btn"
              onClick={handleSubmitProductPicker}
              disabled={orderSubmitting || productPickerSelectedIds.length === 0}
            >
              <Plus size={15} />
              <span>
                {productPickerSelectedIds.length
                  ? `Done (${productPickerSelectedIds.length})`
                  : 'Done'}
              </span>
            </button>
          </div>
        </section>
      </WindowModal>
      {quickProductFormOpen ? (
        <ProductForm
          mode="quick"
          onClose={handleCloseQuickProductForm}
          onSave={handleQuickProductSaved}
        />
      ) : null}
    </>
  );
}
