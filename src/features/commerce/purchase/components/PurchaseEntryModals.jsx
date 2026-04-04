import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import SafeProductImage from '../../../../shared/components/product/SafeProductImage';
import WindowModal from '../../../../shared/components/window/WindowModal';
import PurchaseDistributorSelector from './PurchaseDistributorSelector';
import PurchaseOrderEntryControlPanel from './PurchaseOrderEntryControlPanel';
import PurchaseOrderSummaryPanel from './PurchaseOrderSummaryPanel';
import PurchaseOrderReviewSheet from './PurchaseOrderReviewSheet';
import ProductForm from '../../../catalog/products/components/form/ProductForm';
import { getLastPurchaseMeta } from '../utils/orderDrafts';

const getPreferredActiveIndex = (items = []) => {
  if (!Array.isArray(items) || !items.length) return 0;
  const draftIndex = items.findIndex((item) => !String(item?.product_query || '').trim() && !String(item?.product_id || '').trim());
  if (draftIndex >= 0) return draftIndex;
  return Math.max(0, items.length - 1);
};
const hasMeaningfulDraftRow = (item = {}) => (
  Number(item?.product_id || 0) > 0
  || String(item?.product_query || '').trim().length > 0
  || String(item?.product_name || '').trim().length > 0
  || Number(item?.quantity || 0) > 1
  || Number(item?.rate ?? item?.unit_price ?? 0) > 0
);
const formatReviewAmount = (value) => Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const normalizeDiscountColumnType = (value) => (
  String(value || '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percent'
);
const getDiscountColumnLabel = (value) => (
  normalizeDiscountColumnType(value) === 'fixed' ? 'Disc ₹' : 'Disc %'
);
const getDiscountColumnSuffix = (value) => (
  normalizeDiscountColumnType(value) === 'fixed' ? '₹' : '%'
);
const resolveDiscountColumnType = (items = []) => {
  if (!Array.isArray(items) || !items.length) return 'percent';
  const preferredItem = items.find((item) => Number(item?.discount_value || 0) > 0)
    || items.find((item) => hasMeaningfulDraftRow(item))
    || items[0];
  return normalizeDiscountColumnType(preferredItem?.discount_type);
};
const ORDER_FLOW_STEPS = [
  {
    key: 'supplier',
    label: 'Supplier',
    title: 'Select Supplier',
    description: 'Choose the supplier first. The popup expands into the item screen after selection.',
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

const getDraftRowIssue = (rowDiagnostics = {}) => {
  if (rowDiagnostics.duplicateMessage) {
    return { tone: 'danger', text: 'Duplicate', detail: rowDiagnostics.duplicateMessage };
  }
  if (rowDiagnostics.discountBlockingMessage) {
    return { tone: 'danger', text: 'Fix discount', detail: rowDiagnostics.discountBlockingMessage };
  }
  if (rowDiagnostics.rateAcknowledgementMessage) {
    return { tone: 'bad', text: 'Confirm rate', detail: rowDiagnostics.rateAcknowledgementMessage };
  }
  if (rowDiagnostics.discountAcknowledgementMessage) {
    return { tone: 'bad', text: 'Confirm discount', detail: rowDiagnostics.discountAcknowledgementMessage };
  }
  if (rowDiagnostics.rateWarningMessage) {
    return {
      tone: rowDiagnostics.rateChangeTone || 'neutral',
      text: rowDiagnostics.rateChangeLabel || 'Rate changed',
      detail: rowDiagnostics.rateWarningMessage,
    };
  }
  if (rowDiagnostics.discountWarningMessage) {
    return { tone: 'neutral', text: 'Discount check', detail: rowDiagnostics.discountWarningMessage };
  }
  return null;
};

const isSupplierDefaultItem = (item = {}) => (
  item?.po_item_locked === true
  || item?.po_item_source === 'supplier_default'
  || String(item?.row_source || '').trim().toLowerCase() === 'supplier'
);

export function PurchaseOrderFormModal({
  open,
  closeOrderForm,
  poModalRef,
  isMobile,
  poModalSize,
  editingOrderId,
  handleOrderSubmit,
  handleOpenOrderReview,
  orderFullMode,
  setOrderFullMode,
  orderReviewMode,
  closeOrderReview,
  loadingDistributorItems,
  orderFormData,
  setOrderFormData,
  orderDraftProjection,
  handleDistributorInputChange,
  distributors,
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
  inline = false,
}) {
  const [mobileStep, setMobileStep] = useState(0);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerSearch, setProductPickerSearch] = useState('');
  const [productPickerSelectedIds, setProductPickerSelectedIds] = useState([]);
  const [quickProductFormOpen, setQuickProductFormOpen] = useState(false);
  const [productPickerVisibleLimit, setProductPickerVisibleLimit] = useState(48);
  const [discountColumnType, setDiscountColumnType] = useState(
    () => resolveDiscountColumnType(orderFormData?.items)
  );
  const deferredProductPickerSearch = useDeferredValue(productPickerSearch);
  const distributorInputRef = useRef(null);
  const quantityInputRefs = useRef({});
  const formFooterRef = useRef(null);
  const submitButtonRef = useRef(null);
  const productPickerScrollRef = useRef(null);
  const productPickerLoadMoreRef = useRef(null);
  const previousDistributorIdRef = useRef('');
  const productPickerPageSize = 48;

  const items = Array.isArray(orderFormData?.items) ? orderFormData.items : [];
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
  const activeDistributors = distributors.filter((distributor) => distributor.status === 'active');
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
  }, [orderProductOptions?.all, orderProductOptions?.prioritized]);
  const visibleOrderRows = useMemo(
    () => draftProjection.rows
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
      .filter((entry) => hasMeaningfulDraftRow(entry.item)),
    [draftDiagnostics.rowDiagnostics, draftProjection.rows, productLookupById]
  );
  const reviewableOrderRows = useMemo(
    () => visibleOrderRows.filter((entry) => Number(entry?.item?.quantity || 0) > 0),
    [visibleOrderRows]
  );
  const reviewQuantityTotal = useMemo(
    () => reviewableOrderRows.reduce((sum, entry) => sum + Math.max(0, Number(entry?.item?.quantity || 0) || 0), 0),
    [reviewableOrderRows]
  );
  const reviewSheetRows = useMemo(
    () => reviewableOrderRows.map((entry, index) => {
      const rowItem = entry?.item || {};
      const rowLine = entry?.line || {};
      return {
        key: `review-row-${index}-${rowItem?.product_id || rowItem?.product_query || 'draft'}`,
        name: String(rowItem?.product_name || rowItem?.product_query || `Row ${index + 1}`).trim(),
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
  const supplierBoardItemCount = useMemo(
    () => visibleOrderRows.reduce((sum, entry) => (isSupplierDefaultItem(entry?.item || {}) ? sum + 1 : sum), 0),
    [visibleOrderRows]
  );
  const displayedOrderRows = visibleOrderRows;
  const existingOrderProductIds = useMemo(
    () => new Set(
      visibleOrderRows
        .map((entry) => String(entry?.item?.product_id || '').trim())
        .filter(Boolean)
    ),
    [visibleOrderRows]
  );
  const registeredSupplierProductIds = useMemo(
    () => new Set(
      (Array.isArray(supplierRegisteredProducts) ? supplierRegisteredProducts : [])
        .map((product) => String(product?.product_id || product?.id || '').trim())
        .filter(Boolean)
    ),
    [supplierRegisteredProducts]
  );
  const productPickerProducts = useMemo(() => {
    const prioritized = Array.isArray(orderProductOptions?.prioritized) ? orderProductOptions.prioritized : [];
    const all = Array.isArray(orderProductOptions?.all) ? orderProductOptions.all : [];
    const seen = new Set();
    return [...prioritized, ...all]
      .filter((product) => {
        const productId = String(product?.id || '').trim();
        if (!productId || seen.has(productId)) return false;
        seen.add(productId);
        if (product?.is_active === false || Number(product?.is_active || 1) === 0) return false;
        return true;
      });
  }, [orderProductOptions?.all, orderProductOptions?.prioritized]);
  const filteredProductPickerProducts = useMemo(() => {
    const query = String(deferredProductPickerSearch || '').trim().toLowerCase();
    if (!query) return productPickerProducts;
    return productPickerProducts.filter((product) => {
      const candidates = [
        product?.name,
        product?.sku,
        product?.barcode,
        product?.brand,
        product?.category,
      ];
      return candidates.some((value) => String(value || '').toLowerCase().includes(query));
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
    () => productPickerProducts.filter((product) => {
      const productId = String(product?.id || '').trim();
      if (!productId) return false;
      if (existingOrderProductIds.has(productId)) return false;
      if (registeredSupplierProductIds.has(productId)) return false;
      return true;
    }),
    [existingOrderProductIds, productPickerProducts, registeredSupplierProductIds]
  );
  const filteredAllProductPickerProducts = useMemo(
    () => filteredProductPickerProducts.filter((product) => {
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
  const canLoadMorePickerProducts = productPickerVisibleLimit < filteredAllProductPickerProducts.length;
  const formTitle = editingOrderId ? 'Edit Purchase Order' : 'Create Purchase Order';
  const formSubtitle = '';
  const closeButtonLabel = inline ? 'Reset Form' : 'Cancel';
  const distributorSelected = Boolean(String(orderFormData?.distributor_id || '').trim());
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
        height: orderReviewMode ? 760 : (activeWizardStep === 1 ? (productPickerOpen ? 860 : 780) : 700),
      };
  const trimmedProductPickerSearch = String(productPickerSearch || '').trim();
  const hasProductPickerSearch = trimmedProductPickerSearch.length > 0;
  const productPickerVisibleCount = filteredAllProductPickerProducts.length;
  const productPickerAvailableCount = availableAllProductPickerProducts.length;
  const productPickerStatusLabel = loadingDistributorItems
    ? 'Loading supplier board...'
    : hasProductPickerSearch
      ? `${productPickerVisibleCount} match${productPickerVisibleCount === 1 ? '' : 'es'}`
      : `${productPickerAvailableCount} extra product${productPickerAvailableCount === 1 ? '' : 's'}`;

  const focusSupplierField = useCallback((select = false) => {
    const target = distributorInputRef.current;
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.focus();
      if (select && typeof target.select === 'function') target.select();
    });
  }, []);
  const focusQuantityField = useCallback((rowIndex) => {
    const target = quantityInputRefs.current[rowIndex];
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.focus();
      if (typeof target.select === 'function') target.select();
    });
  }, []);

  const isWizardStepUnlocked = useCallback((stepIndex) => {
    if (stepIndex <= 0) return true;
    if (!distributorSelected) return false;
    if (stepIndex >= ORDER_FLOW_REVIEW_STEP) return orderReviewMode;
    return stepIndex === 1;
  }, [distributorSelected, orderReviewMode]);

  const focusWorkflowStep = useCallback((stepIndex) => {
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
  }, [distributorSelected, focusSupplierField, isWizardStepUnlocked, orderReviewMode]);

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

  useEffect(() => {
    if (!open) return undefined;
    if (orderReviewMode) {
      setMobileStep(ORDER_FLOW_REVIEW_STEP);
    } else if (!String(orderFormData?.distributor_id || '').trim()) {
      setMobileStep(0);
    } else {
      setMobileStep(1);
    }
    setActiveItemIndex(getPreferredActiveIndex(items));
    setProductPickerOpen(false);
    setProductPickerSearch('');
    setProductPickerSelectedIds([]);
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
  }, [open]);

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

  useEffect(() => {
    if (!open) return;
    const previousDistributorId = previousDistributorIdRef.current;
    const nextDistributorId = String(orderFormData?.distributor_id || '').trim();
    if (!nextDistributorId) {
      setMobileStep(0);
      setProductPickerOpen(false);
      setProductPickerSearch('');
      setProductPickerSelectedIds([]);
      previousDistributorIdRef.current = nextDistributorId;
      return;
    }
    if (previousDistributorId !== nextDistributorId) {
      setMobileStep(1);
      setProductPickerOpen(false);
      setProductPickerSearch('');
      setProductPickerSelectedIds([]);
    }
    previousDistributorIdRef.current = nextDistributorId;
  }, [open, orderFormData?.distributor_id]);

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

  useEffect(() => {
    if (!open) return;
    const nextType = resolveDiscountColumnType(items);
    setDiscountColumnType((current) => (current === nextType ? current : nextType));
  }, [items, open]);

  useEffect(() => {
    if (activeWizardStep !== 1 || orderReviewMode) {
      setProductPickerOpen(false);
      setProductPickerSelectedIds([]);
      setProductPickerSearch('');
    }
  }, [activeWizardStep, orderReviewMode]);

  useEffect(() => {
    if (!productPickerOpen) return;
    setProductPickerVisibleLimit(productPickerPageSize);
  }, [deferredProductPickerSearch, productPickerOpen, productPickerPageSize, filteredAllProductPickerProducts.length]);

  useEffect(() => {
    if (!productPickerOpen) return undefined;
    const rootNode = productPickerScrollRef.current;
    const sentinel = productPickerLoadMoreRef.current;
    if (!sentinel || !canLoadMorePickerProducts) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setProductPickerVisibleLimit((current) => (
          Math.min(current + productPickerPageSize, filteredAllProductPickerProducts.length)
        ));
      },
      {
        root: rootNode || null,
        rootMargin: '200px',
        threshold: 0.01,
      }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMorePickerProducts, filteredAllProductPickerProducts.length, productPickerOpen, productPickerPageSize]);

  const handleRemoveRow = useCallback((index = resolvedActiveItemIndex) => {
    const nextIndex = Math.max(0, Math.min(index, items.length - 2));
    handleOrderItemRemove(index);
    setActiveItemIndex(nextIndex);
    setMobileStep(1);
  }, [handleOrderItemRemove, items.length, resolvedActiveItemIndex]);

  const moveDisplayedRowFocus = useCallback((rowIndex, direction = 1) => {
    const currentPosition = displayedOrderRows.findIndex((entry) => entry.index === rowIndex);
    if (currentPosition < 0) return;
    const nextPosition = direction < 0
      ? Math.max(0, currentPosition - 1)
      : Math.min(displayedOrderRows.length - 1, currentPosition + 1);
    const nextIndex = displayedOrderRows[nextPosition]?.index;
    if (typeof nextIndex !== 'number') return;
    setActiveItemIndex(nextIndex);
    focusQuantityField(nextIndex);
  }, [displayedOrderRows, focusQuantityField]);

  const toggleProductPickerSelection = useCallback((productId) => {
    const normalizedProductId = String(productId || '').trim();
    if (!normalizedProductId) return;
    if (existingOrderProductIds.has(normalizedProductId)) return;
    setProductPickerSelectedIds((prev) => (
      prev.includes(normalizedProductId)
        ? prev.filter((entry) => entry !== normalizedProductId)
        : [...prev, normalizedProductId]
    ));
  }, [existingOrderProductIds]);

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

  const handleProductPickerSearchChange = useCallback((event) => {
    if (!distributorSelected) {
      focusWorkflowStep(0);
      return;
    }
    setProductPickerOpen(true);
    setProductPickerSearch(event.target.value);
  }, [distributorSelected, focusWorkflowStep]);

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
  }, [handleApplyCatalogProducts, handleCloseProductPicker, productPickerSelectedIds, selectablePickerProductsById]);

  const handleOpenProductsCatalog = useCallback(() => {
    setQuickProductFormOpen(true);
  }, []);

  const handleCloseQuickProductForm = useCallback(() => {
    setQuickProductFormOpen(false);
  }, []);

  const handleQuickProductSaved = useCallback(() => {
    setQuickProductFormOpen(false);
  }, []);

  const handleSubmitProductPicker = useCallback(() => {
    if (orderSubmitting || productPickerSelectedIds.length === 0) return;
    void handleApplySelectedProducts();
  }, [handleApplySelectedProducts, orderSubmitting, productPickerSelectedIds.length]);

  const handleProductPickerKeyDown = useCallback((event) => {
    if (event.key !== 'Enter') return;
    if (event.defaultPrevented) return;
    event.preventDefault();
    handleSubmitProductPicker();
  }, [handleSubmitProductPicker]);

  const handleReviewSubmit = useCallback((event) => {
    event.preventDefault();
    const opened = handleOpenOrderReview();
    if (opened && isMobile) {
      setMobileStep(ORDER_FLOW_REVIEW_STEP);
    }
  }, [handleOpenOrderReview, isMobile]);

  const handleFormSubmit = useCallback((event) => {
    event.preventDefault();
  }, []);
  const handleFinalSubmitClick = useCallback((event) => {
    event.preventDefault();
    handleOrderSubmit(event);
  }, [handleOrderSubmit]);
  const handleQuantityKeyDown = useCallback((rowIndex) => (event) => {
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1;
    moveDisplayedRowFocus(rowIndex, direction);
  }, [moveDisplayedRowFocus]);
  const handleInlineFieldKeyDown = useCallback((rowIndex) => (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    moveDisplayedRowFocus(rowIndex, event.shiftKey ? -1 : 1);
  }, [moveDisplayedRowFocus]);
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
  const handleDiscountValueChange = useCallback((rowIndex) => (event) => {
    const nextValue = event.target.value;
    if (normalizeDiscountColumnType(items[rowIndex]?.discount_type) !== discountColumnType) {
      handleOrderItemChange(rowIndex, 'discount_type', discountColumnType);
    }
    handleOrderItemChange(rowIndex, 'discount_value', nextValue);
  }, [discountColumnType, handleOrderItemChange, items]);

  if (!open) return null;

  const canSubmitOrder = orderReviewMode && canReviewOrder;
  const reviewActionLabel = editingOrderId ? 'Review Update' : 'Review';
  const finalSubmitLabel = editingOrderId ? 'Final Update' : 'Final Submit';
  const stepPrimaryActionLabel = orderReviewMode
    ? finalSubmitLabel
    : activeWizardStep === 0
      ? 'Continue to Items'
      : reviewActionLabel;
  const stepPrimaryActionDisabled = orderReviewMode
    ? !canSubmitOrder
    : activeWizardStep === 0
      ? (!distributorSelected || orderSubmitting)
      : (!canReviewOrder || orderSubmitting);
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
    <div ref={poModalRef} className={inline ? 'po-entry-inline-shell' : 'po-entry-workspace-shell'} style={inline ? undefined : { width: '100%', height: '100%' }}>
      <form
        onSubmit={handleFormSubmit}
        className={[
          'po-entry-form',
          'po-entry-view-form',
          !inline ? 'fullscreen-workspace' : '',
          supplierOnlyStep ? 'supplier-step' : '',
          itemsWorkspaceStep ? 'items-workspace' : '',
          reviewWorkspaceStep ? 'review-workspace' : '',
        ].filter(Boolean).join(' ')}
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
                      <small>{draft.itemCount} item{draft.itemCount === 1 ? '' : 's'} • Total {formatReviewAmount(draft.totalAmount || 0)}</small>
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
            <section className={`po-popup-supplier-stage${supplierOnlyStep ? ' supplier-focus' : ''}`}>
              <div className={`po-party-grid${supplierOnlyStep ? ' po-supplier-focus-grid' : ' po-entry-header-grid'}`}>
                <PurchaseDistributorSelector
                  activeDistributors={activeDistributors}
                  orderFormData={orderFormData}
                  handleDistributorInputChange={handleDistributorInputChange}
                  distributorInputRef={distributorInputRef}
                />
              </div>
            </section>
          ) : null}

          {!orderReviewMode && activeWizardStep === 1 ? (
            <div className={`po-popup-items-screen single-flow${productPickerOpen ? ' picker-open' : ''}`}>
              <section className="po-popup-inline-toolbar compact">
                <div className="po-popup-inline-toolbar-copy">
                  <strong>{String(orderFormData?.distributor_name || '').trim() || 'Supplier selected'}</strong>
                  <small>Update delivery date and note during review before final submit.</small>
                </div>
                <div className="po-popup-inline-toolbar-actions">
                  <button
                    type="button"
                    className="po-popup-inline-action"
                    onClick={() => focusWorkflowStep(0)}
                    disabled={orderSubmitting}
                  >
                    Change Supplier
                  </button>
                </div>
              </section>

              <section className="po-popup-selected-panel full-width">
                <div className="po-pos-panel-header">
                  <div>
                    <h4>Products</h4>
                    <p className="po-pos-panel-note">Enter qty first. Press Enter for the next row. All supplier items are loaded by default.</p>
                  </div>
                  <div className="po-popup-board-toolbar">
                    <span className="po-popup-board-count">
                      {supplierBoardItemCount} supplier items • {reviewableOrderRows.length} ordered
                    </span>
                    <button
                      type="button"
                      className="po-popup-inline-action"
                      onClick={handleOpenProductPicker}
                      disabled={orderSubmitting}
                    >
                      Add Product
                    </button>
                  </div>
                </div>
                {displayedOrderRows.length ? (
                  <div className="po-popup-items-table">
                    <div className="po-popup-items-table-head">
                      <span>Product</span>
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
                      {displayedOrderRows.map(({ index, item, line, product, diagnostics }) => {
                        const displayName = String(item?.product_name || item?.product_query || `Row ${index + 1}`).trim();
                        const rowUom = String(line?.uom || item?.uom || 'pcs').trim() || 'pcs';
                        const lastPurchaseMeta = getLastPurchaseMeta(item);
                        const compactLastPurchaseLabel = lastPurchaseMeta.hasValue
                          ? [
                              lastPurchaseMeta.rate > 0 ? `₹${formatReviewAmount(lastPurchaseMeta.rate)}` : '',
                              lastPurchaseMeta.ageLabel || lastPurchaseMeta.dateLabel,
                            ].filter(Boolean).join(' • ')
                          : '';
                        const itemUomOptions = getAllowedPurchaseUnitsForProduct(product);
                        const rowIssue = getDraftRowIssue(diagnostics);
                        const gstRate = Number(item?.gst_rate ?? line?.gstRate ?? 0) || 0;
                        const quantityStep = getPurchasePackStep(product, rowUom);
                        const currentRate = Number(item?.rate ?? item?.unit_price ?? 0) || 0;
                        const seededRate = Number(
                          item?.last_purchase_rate
                          || item?.auto_fill_seed_rate
                          || item?.reference_rate
                          || item?.rate
                          || 0
                        ) || 0;
                        const hasEditedRate = seededRate > 0 && Math.abs(currentRate - seededRate) > 0.001;
                        const isActiveRow = activeItemIndex === index;
                        const quantityValue = Math.max(0, Number(item?.quantity || 0) || 0);
                        const rowLocked = isSupplierDefaultItem(item);
                        const rowIsZero = quantityValue <= 0;
                        const rowMetaNote = [
                          compactLastPurchaseLabel,
                          rowIssue ? rowIssue.text : '',
                          !rowIssue && hasEditedRate ? 'edited' : '',
                        ].filter(Boolean).join(' • ');
                        return (
                          <article
                            key={`selected-po-row-${index}`}
                            className={`po-popup-items-table-row selected${isActiveRow ? ' active' : ''}${rowLocked ? ' locked' : ''}${rowIsZero ? ' zero' : ''}`}
                          >
                            <div className="po-popup-grid-product">
                              <SafeProductImage
                                product={product || { name: displayName, image: item?.image || item?.image_url || '' }}
                                alt={displayName}
                                className="po-popup-grid-image"
                              />
                              <div className="po-popup-grid-product-copy">
                                <strong>{displayName}</strong>
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
                                step={getPurchasePackStep(product, rowUom)}
                                value={item?.quantity ?? ''}
                                onChange={(event) => handleOrderItemChange(index, 'quantity', event.target.value)}
                                onFocus={() => setActiveItemIndex(index)}
                                onKeyDown={handleQuantityKeyDown(index)}
                                disabled={orderSubmitting}
                                aria-label={`Quantity for ${displayName}`}
                              />
                              {quantityStep > 1 ? <small>pack {quantityStep}</small> : null}
                            </div>
                            <div className="po-popup-grid-cell">
                              <select
                                value={rowUom}
                                onChange={(event) => handleOrderItemChange(index, 'uom', event.target.value)}
                                onFocus={() => setActiveItemIndex(index)}
                                onKeyDown={handleInlineFieldKeyDown(index)}
                                disabled={orderSubmitting}
                                aria-label={`Unit for ${displayName}`}
                              >
                                {itemUomOptions.map((uomOption) => (
                                  <option key={`${index}-${uomOption}`} value={uomOption}>{uomOption}</option>
                                ))}
                              </select>
                            </div>
                            <div className="po-popup-grid-cell">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item?.rate ?? item?.unit_price ?? ''}
                                onChange={(event) => handleOrderItemChange(index, 'rate', event.target.value)}
                                onFocus={() => setActiveItemIndex(index)}
                                onKeyDown={handleInlineFieldKeyDown(index)}
                                disabled={orderSubmitting}
                                aria-label={`Rate for ${displayName}`}
                              />
                            </div>
                            <div className="po-popup-grid-cell">
                              <select
                                value={gstRate}
                                onChange={(event) => handleOrderItemChange(index, 'gst_rate', toNumber(event.target.value))}
                                onFocus={() => setActiveItemIndex(index)}
                                onKeyDown={handleInlineFieldKeyDown(index)}
                                disabled={orderSubmitting}
                                aria-label={`GST for ${displayName}`}
                              >
                                {GST_RATE_OPTIONS.map((rateOption) => (
                                  <option key={`${index}-gst-${rateOption}`} value={rateOption}>{rateOption}%</option>
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
                                aria-label={`${getDiscountColumnLabel(discountColumnType)} for ${displayName}`}
                              />
                              <small>{getDiscountColumnSuffix(discountColumnType)}</small>
                            </div>
                            <div className="po-popup-grid-total">
                              <strong>₹{formatReviewAmount(line?.totalAmount || 0)}</strong>
                              {rowIssue ? <small>{rowIssue.text}</small> : null}
                              <div className="po-popup-grid-total-actions">
                                {diagnostics.rateRequiresAcknowledgement ? (
                                  <button
                                    type="button"
                                    className="po-popup-inline-action"
                                    onClick={() => handleOrderItemChange(index, 'rate_warning_acknowledged', true)}
                                    disabled={orderSubmitting}
                                  >
                                    Confirm rate
                                  </button>
                                ) : null}
                                {diagnostics.discountRequiresAcknowledgement ? (
                                  <button
                                    type="button"
                                    className="po-popup-inline-action"
                                    onClick={() => handleOrderItemChange(index, 'discount_warning_acknowledged', true)}
                                    disabled={orderSubmitting}
                                  >
                                    Confirm discount
                                  </button>
                                ) : null}
                                {!rowLocked ? (
                                  <button
                                    type="button"
                                    className="po-popup-inline-action danger"
                                    onClick={() => handleRemoveRow(index)}
                                    disabled={orderSubmitting}
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="po-pos-empty-state">
                    <strong>{loadingDistributorItems ? 'Loading supplier products...' : 'No supplier products are loaded yet.'}</strong>
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
            <PurchaseOrderReviewSheet
              kicker="Purchase Order"
              title="Review Before Final Submit"
              description="Printed-bill style check. Only rows with qty above zero are included."
              badgeLabel={`${reviewableOrderRows.length} item${reviewableOrderRows.length === 1 ? '' : 's'}`}
              metaItems={[
                { label: 'Supplier:', value: String(orderFormData?.distributor_name || '').trim() || 'Not selected' },
                { label: 'Date:', value: new Date().toLocaleDateString() },
                { label: 'Delivery:', value: String(orderFormData?.expected_delivery || '').trim() || 'Skipped' },
              ]}
              rows={reviewSheetRows}
              totals={orderTotals}
            >
              <PurchaseOrderEntryControlPanel
                draftDiagnostics={draftDiagnostics}
                orderFullMode={orderFullMode}
                orderFormData={orderFormData}
                setOrderFormData={setOrderFormData}
              />

              {!reviewableOrderRows.length ? (
                <div className="po-pos-empty-state">
                  <strong>No reviewable items yet.</strong>
                  <p>Return to the items step and enter quantity above zero for at least one product.</p>
                </div>
              ) : null}
            </PurchaseOrderReviewSheet>
          ) : null}
        </div>

        <div ref={formFooterRef} className={`form-section po-form-section po-form-footer${supplierOnlyStep ? ' supplier-step' : ''}`}>
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
              <button type="button" className="submit-btn secondary" onClick={saveCurrentOrderDraft} disabled={orderSubmitting}>
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
        subtitle="Extra products outside the supplier board"
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
                placeholder="Search products by name or SKU..."
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
              <strong>Add Extra Products</strong>
              <span className="po-product-picker-count">
                {hasProductPickerSearch
                  ? `${productPickerVisibleCount} shown`
                  : `${productPickerAvailableCount} available`}
              </span>
            </div>
            <p className="po-pos-panel-note">
              Only products outside this supplier's registered board are shown here. Products already on the board stay hidden.
            </p>
          </div>

          <div ref={productPickerScrollRef} className="po-product-picker-scroll">
            {filteredAllProductPickerProducts.length ? (
              <div className="po-product-picker-grid" role="list" aria-label="Selectable products">
                {visibleProductPickerProducts.map((product) => {
                  const productId = String(product?.id || '').trim();
                  const isSelected = productPickerSelectedIds.includes(productId);
                  const productRate = Number(product?.price || 0) || 0;
                  const productStock = Number(product?.stock || 0) || 0;
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
                        <small>
                          {[product?.brand, product?.category].filter(Boolean).join(' • ') || 'Catalog item'}
                        </small>
                        <div className="po-product-picker-card-meta">
                          <span>Rate {formatReviewAmount(productRate)}</span>
                          <span>{productStock > 0 ? `Stock ${productStock}` : 'Stock 0'}</span>
                        </div>
                      </div>
                      <span className={`po-product-picker-card-state${isSelected ? ' selected' : ''}`}>
                        {isSelected ? 'Selected' : 'Tap'}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="po-pos-empty-state">
                <strong>{availableAllProductPickerProducts.length ? 'No matching products found.' : 'No more catalog products are available.'}</strong>
                <p>
                  {availableAllProductPickerProducts.length
                    ? 'Try another search term to add products from the catalog.'
                    : 'All supplier-board products are already loaded, and no extra catalog products remain to add.'}
                </p>
              </div>
            )}
            {canLoadMorePickerProducts ? (
              <div ref={productPickerLoadMoreRef} className="po-product-picker-load-more" aria-hidden="true" />
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
              <span>{productPickerSelectedIds.length ? `Done (${productPickerSelectedIds.length})` : 'Done'}</span>
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
