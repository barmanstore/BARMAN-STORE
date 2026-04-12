import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { productsApi, billingApi, creditApi } from '../../../shared/services/api';
import { formatCurrency } from '../../../shared/utils/formatters';
import { buildBillShareText } from '../../../shared/utils/messageTemplates';
import { safeSessionStorageGet, safeSessionStorageSet } from '../../../shared/utils/storage';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import useProductSearchCombobox from '../../../shared/hooks/useProductSearchCombobox';
import usePopupDraftPersistence from '../../../shared/hooks/usePopupDraftPersistence';
import * as info from '../../../shared/info';
import BillingTabView from './components/BillingTabView';
import {
  createEmptyItem,
  getProductOptionLabel,
} from './utils/billingLineItemUtils';
import { calculateLineAmount } from './utils/billingAmountUtils';
import {
  getAllowedUnitsForProduct,
  resolveLineUnitForProduct,
} from './utils/billingUnitUtils';
import useBillingCreateBill from './hooks/useBillingCreateBill';
import useBillingCheckoutHandlers from './hooks/useBillingCheckoutHandlers';
import useBillingItemHandlers from './hooks/useBillingItemHandlers';
import useBillingState from './hooks/useBillingState';
import useBillingPricing from './hooks/useBillingPricing';
import './BillingTab.css';

const DEFAULT_UNIT_OPTIONS = ['pcs', 'kg', 'g', 'l', 'ml', 'dozen'];
const PRODUCT_SEARCH_SUGGESTION_LIMIT = 8;
const PRODUCT_SEARCH_CACHE_LIMIT = 24;
const PRODUCT_CACHE_LIMIT = 160;
const SEARCH_PRODUCT_POOL_LIMIT = 240;
const PRODUCT_SEARCH_MIN_CHARS = 2;
const BILLING_LOOKUP_CACHE_KEY = 'billing_lookup_cache_v1';
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

const mergeProductsById = (currentList = [], nextList = [], maxItems = PRODUCT_CACHE_LIMIT) => {
  const merged = [];
  const seen = new Set();

  [...nextList, ...currentList].forEach((product) => {
    const id = Number(product?.id || 0);
    if (id <= 0 || seen.has(id)) return;
    seen.add(id);
    merged.push(product);
  });

  return merged.slice(0, maxItems);
};

const mergeCustomersById = (currentList = [], nextList = []) => {
  const byId = new Map();
  currentList.forEach((customer) => {
    const id = Number(customer?.id || 0);
    if (id > 0) byId.set(id, customer);
  });
  nextList.forEach((customer) => {
    const id = Number(customer?.id || 0);
    if (id > 0) byId.set(id, customer);
  });
  return Array.from(byId.values());
};

const readCachedBillingLookups = () => {
  try {
    const raw = safeSessionStorageGet(BILLING_LOOKUP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);
    if (!updatedAt || (Date.now() - updatedAt) > LOOKUP_CACHE_TTL_MS) {
      return null;
    }
    const customers = Array.isArray(parsed?.customers) ? parsed.customers : null;
    const products = Array.isArray(parsed?.products) ? parsed.products : null;
    if (!customers || !products) return null;
    return { customers, products };
  } catch (_) {
    return null;
  }
};

const writeCachedBillingLookups = ({ customers, products }) => {
  safeSessionStorageSet(BILLING_LOOKUP_CACHE_KEY, JSON.stringify({
    updatedAt: Date.now(),
    customers: Array.isArray(customers) ? customers : [],
    products: Array.isArray(products) ? products : [],
  }));
};

const isEditableElement = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
};

const isInteractiveElement = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest(
    'button, a, summary, [role="button"], [role="link"], [role="menuitem"], [tabindex]:not([tabindex="-1"])'
  ));
};

const normalizeLookupKey = (value = '') => String(value || '').trim().toLowerCase();
const normalizeCustomItemName = (value = '') => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();
const getBillingItemType = (item = {}) => {
  const productId = Number(item?.productId || item?.product_id || 0);
  if (productId > 0) return 'inventory';
  if (String(item?.type || '').trim().toLowerCase() === 'custom' || Boolean(item?.isCustom)) {
    return 'custom';
  }
  return 'inventory';
};

const BillingTabController = ({
  initialPrefill = null,
  onPrefillApplied = null,
  shortcutFocusRequest = 0,
  onShortcutFocusHandled = null,
  popupMode = false,
  draftStorageKey = '',
}) => {
  const isMobile = useIsMobile();
  const {
    customer,
    setCustomer,
    currentItem,
    setCurrentItem,
    billItems,
    setBillItems,
    editIndex,
    setEditIndex,
    selectedBillIndex,
    setSelectedBillIndex,
    lastAddedItemId,
    setLastAddedItemId,
    lastRemovedItem,
    setLastRemovedItem,
    loading,
    setLoading,
    error,
    setError,
    isSubmitting,
    setIsSubmitting,
    paidAmount,
    setPaidAmount,
    lastShareText,
    setLastShareText,
    lastShareNumber,
    setLastShareNumber,
    lastSharePhone,
    setLastSharePhone,
    prefillSummary,
    setPrefillSummary,
    linkedOrderId,
    setLinkedOrderId,
    fulfillmentMode,
    setFulfillmentMode,
    showCustomerCreateModal,
    setShowCustomerCreateModal,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    customersList,
    setCustomersList,
    productsList,
    setProductsList,
    pendingProductSelectionReview,
    setPendingProductSelectionReview,
    productSearchMessage,
    setProductSearchMessage,
    createBillConfirmationOpen,
    setCreateBillConfirmationOpen,
    clearBillConfirmationOpen,
    setClearBillConfirmationOpen,
    entryActionLocked,
    setEntryActionLocked,
  } = useBillingState();

  const customerSearchTimeout = useRef(null);
  const productSearchInputRef = useRef(null);
  const priceInputRef = useRef(null);
  const qtyInputRef = useRef(null);
  const unitInputRef = useRef(null);
  const discountInputRef = useRef(null);
  const submitButtonRef = useRef(null);
  const appliedPrefillKeyRef = useRef('');
  const createBillConfirmationSignatureRef = useRef('');
  const entryActionLockTimeoutRef = useRef(null);

  useEffect(() => {
    let isActive = true;
    const cachedLookups = readCachedBillingLookups();

    if (cachedLookups) {
      setCustomersList(Array.isArray(cachedLookups.customers) ? cachedLookups.customers : []);
      setProductsList((prev) => mergeProductsById(
        prev,
        Array.isArray(cachedLookups.products) ? cachedLookups.products : []
      ));
      setLoading(false);
    } else {
      setLoading(true);
    }

    const preloadBillingLookups = async () => {
      try {
        const [customersData, productsData] = await Promise.all([
          billingApi.searchCustomers(''),
          productsApi.getAll({ limit: 500 }),
        ]);
        if (!isActive) return;
        const nextCustomers = Array.isArray(customersData) ? customersData : [];
        const nextProducts = Array.isArray(productsData) ? productsData : [];
        setCustomersList(nextCustomers);
        setProductsList((prev) => mergeProductsById(prev, nextProducts));
        writeCachedBillingLookups({
          customers: nextCustomers,
          products: nextProducts,
        });
      } catch (err) {
        console.error('Error preloading billing lookups:', err);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void preloadBillingLookups();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => () => {
    if (customerSearchTimeout.current) clearTimeout(customerSearchTimeout.current);
    if (entryActionLockTimeoutRef.current) clearTimeout(entryActionLockTimeoutRef.current);
  }, []);

  const focusEntryField = useCallback((field = 'search', options = {}) => {
    const refsByField = {
      search: productSearchInputRef.current,
      price: priceInputRef.current,
      qty: qtyInputRef.current,
      unit: unitInputRef.current,
      disc: discountInputRef.current,
      submit: submitButtonRef.current,
    };
    const target = refsByField[field];
    if (!target) return;

    window.requestAnimationFrame(() => {
      target.focus();
      if (options.select && typeof target.select === 'function') {
        target.select();
      }
    });
  }, []);

  const lockEntryActions = useCallback((durationMs = 200) => {
    setEntryActionLocked(true);
    if (entryActionLockTimeoutRef.current) {
      clearTimeout(entryActionLockTimeoutRef.current);
    }
    entryActionLockTimeoutRef.current = window.setTimeout(() => {
      setEntryActionLocked(false);
      entryActionLockTimeoutRef.current = null;
    }, durationMs);
  }, []);

  const productLookup = useMemo(() => {
    const byId = new Map();
    const byKey = new Map();

    productsList.forEach((product) => {
      const id = Number(product?.id || 0);
      if (id > 0) {
        byId.set(id, product);
      }

      [product?.name, product?.sku, product?.barcode].forEach((candidate) => {
        const key = normalizeLookupKey(candidate);
        if (key) {
          byKey.set(key, product);
        }
      });
    });

    return { byId, byKey };
  }, [productsList]);

  const getProductForLine = useCallback((line = {}) => {
    if (getBillingItemType(line) === 'custom') {
      return null;
    }

    const productId = Number(line?.productId || line?.product_id || 0);
    if (productId > 0) {
      const byId = productLookup.byId.get(productId);
      if (byId) return byId;
    }

    const nameKey = normalizeLookupKey(line?.name || line?.product_name);
    if (!nameKey) return null;

    return productLookup.byKey.get(nameKey) || null;
  }, [productLookup]);

  const calculateAmount = useCallback(
    (price, qty, disc, discType, unit = 'pcs', product = null) =>
      calculateLineAmount(price, qty, disc, discType, unit, product),
    []
  );

  const normalizeBillingItem = useCallback((item = {}) => {
    const product = getProductForLine(item);
    const fallback = createEmptyItem();
    const qty = Math.max(1, Number(item?.qty || 1) || 1);
    const price = Math.max(0, Number(item?.price || 0) || 0);
    const discType = 'fixed';
    const disc = Math.max(0, Number(item?.disc ?? item?.discount ?? 0) || 0);
    const type = getBillingItemType(item);
    const isCustom = type === 'custom';
    const unit = product
      ? resolveLineUnitForProduct(product, item?.unit || 'pcs')
      : (String(item?.unit || fallback.unit || 'pcs').trim() || 'pcs');
    const amount = calculateAmount(price, qty, disc, discType, unit, product).amount;

    return {
      ...fallback,
      ...item,
      id: item?.id || fallback.id,
      type,
      productId: Number(item?.productId || 0) || null,
      isCustom,
      name: isCustom
        ? normalizeCustomItemName(item?.name || '')
        : String(item?.name || '').trimStart(),
      price,
      qty,
      unit,
      disc,
      discount: disc,
      discType,
      amount,
      total: amount,
    };
  }, [calculateAmount, getProductForLine]);

  const buildBillingItemFromProduct = useCallback((product, baseItem = null) => {
    const nextQty = Math.max(1, Number(baseItem?.qty || 1) || 1);
    const nextDisc = Math.max(0, Number(baseItem?.disc || 0) || 0);
    const nextDiscType = 'fixed';
    const resolvedUnit = resolveLineUnitForProduct(
      product,
      baseItem?.unit || product?.base_unit || product?.uom || product?.unit || 'pcs'
    );
    const draft = {
      ...(baseItem || createEmptyItem()),
      type: 'inventory',
      name: String(product?.name || '').trim(),
      productId: Number(product?.id || 0) || null,
      isCustom: false,
      price: Number(product?.price ?? product?.mrp ?? 0) || 0,
      qty: nextQty,
      unit: resolvedUnit,
      disc: nextDisc,
      discType: nextDiscType,
    };
    return normalizeBillingItem(draft);
  }, [normalizeBillingItem]);

  const recentProducts = useMemo(
    () => productsList.slice(0, PRODUCT_SEARCH_SUGGESTION_LIMIT),
    [productsList]
  );

  const searchBillingProducts = useCallback((rawQuery, options = {}) =>
    billingApi.searchProducts(rawQuery, undefined, options), []);

  const {
    searchResults: productSearchResults,
    searchLoading: productSearchLoading,
    activeIndex: activeProductSuggestionIndex,
    setActiveIndex: setActiveProductSuggestionIndex,
    hasExplicitChoice: hasExplicitSuggestionChoice,
    setHasExplicitChoice: setHasExplicitSuggestionChoice,
    resolveExactMatch: resolveExactProductMatch,
    resolveHighlightedProduct,
    clearSearchState,
  } = useProductSearchCombobox({
    query: currentItem?.name || '',
    selectedProductId: currentItem?.productId || '',
    localProducts: productsList,
    searchProducts: searchBillingProducts,
    suggestionLimit: PRODUCT_SEARCH_SUGGESTION_LIMIT,
    cacheLimit: PRODUCT_SEARCH_CACHE_LIMIT,
    poolLimit: SEARCH_PRODUCT_POOL_LIMIT,
    minChars: PRODUCT_SEARCH_MIN_CHARS,
  });

  const {
    billingPricingLoading,
    billingPricingError,
    subtotalAmount,
    totalDiscount,
    totalBill,
    paidAmountWarning,
    paidClamped,
    creditAmount,
    effectivePaymentMethod,
    isOrderLinked,
    activeLineItemsCount,
    paymentStatusLabel,
    lowStockWarning,
    isManualPrice,
    billDisplayItems,
    createBillConfirmationSignature,
    billingDraftDirty,
    currentProduct,
  } = useBillingPricing({
    billItems,
    currentItem,
    customer,
    linkedOrderId,
    fulfillmentMode,
    selectedPaymentMethod,
    paidAmount,
    popupMode,
    getProductForLine,
  });

  const currentUnitOptions = useMemo(() => {
    if (currentProduct) return getAllowedUnitsForProduct(currentProduct);
    const currentUnit = String(currentItem?.unit || 'pcs').trim() || 'pcs';
    return [currentUnit, ...DEFAULT_UNIT_OPTIONS.filter((unitOption) => unitOption !== currentUnit)];
  }, [currentItem?.unit, currentProduct]);

  const {
    handleCurrentItemChange,
    handleSelectSearchProduct,
    handleStartCustomItem,
    handleCommitCurrentItem,
    handleCancelEdit,
    handleSelectBillItem,
    handleDeleteBillItem,
    handleUndoLastRemoval,
    handleProductSearchKeyDown,
    handleEntryFieldKeyDown,
  } = useBillingItemHandlers({
    currentItem,
    billItems,
    editIndex,
    selectedBillIndex,
    lastAddedItemId,
    lastRemovedItem,
    productSearchResults,
    productSearchLoading,
    pendingProductSelectionReview,
    entryActionLocked,
    hasExplicitSuggestionChoice,
    setCurrentItem,
    setBillItems,
    setEditIndex,
    setSelectedBillIndex,
    setLastAddedItemId,
    setLastRemovedItem,
    setPendingProductSelectionReview,
    setProductSearchMessage,
    setHasExplicitSuggestionChoice,
    setClearBillConfirmationOpen,
    setError,
    setProductsList,
    setActiveProductSuggestionIndex,
    setEntryActionLocked,
    clearSearchState,
    focusEntryField,
    lockEntryActions,
    getProductForLine,
    normalizeBillingItem,
    buildBillingItemFromProduct,
    resolveExactProductMatch,
    resolveHighlightedProduct,
  });

  const {
    handleSelectCashPayment,
    handleSelectUpiPayment,
    handleSelectCreditPayment,
    handleCustomerChange,
    handleAddCustomer,
    handleCustomerModalSave,
    handleCopyShare,
    handleSendWhatsApp,
    handleClear,
    handleCancelCreateBillConfirmation,
    handleCancelClearBillConfirmation,
    handleCustomerModalClose,
  } = useBillingCheckoutHandlers({
    billingApi,
    customer,
    billItems,
    currentItem,
    customersList,
    totalBill,
    paidAmount,
    selectedPaymentMethod,
    lastShareText,
    lastSharePhone,
    isOrderLinked,
    clearBillConfirmationOpen,
    customerSearchTimeoutRef: customerSearchTimeout,
    setCustomer,
    setCustomersList,
    setClearBillConfirmationOpen,
    setSelectedPaymentMethod,
    setPaidAmount,
    setShowCustomerCreateModal,
    setCurrentItem,
    setBillItems,
    setEditIndex,
    setSelectedBillIndex,
    setLastAddedItemId,
    setLastRemovedItem,
    setPrefillSummary,
    setLinkedOrderId,
    setFulfillmentMode,
    setPendingProductSelectionReview,
    setProductSearchMessage,
    setEntryActionLocked,
    setCreateBillConfirmationOpen,
    setError,
    clearSearchState,
    focusEntryField,
    createBillConfirmationSignatureRef,
    setLastShareText,
    setLastShareNumber,
    setLastSharePhone,
  });

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (activeElement && activeElement !== document.body) return;
      productSearchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!shortcutFocusRequest || showCustomerCreateModal) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      productSearchInputRef.current?.focus();
      if (typeof onShortcutFocusHandled === 'function') {
        onShortcutFocusHandled();
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    onShortcutFocusHandled,
    shortcutFocusRequest,
    showCustomerCreateModal,
  ]);

  useEffect(() => {
    const prefillKey = String(initialPrefill?.key || '').trim();
    if (!prefillKey) return;
    if (appliedPrefillKeyRef.current === prefillKey) return;
    appliedPrefillKeyRef.current = prefillKey;

    const prefillCustomer = initialPrefill?.customer && typeof initialPrefill.customer === 'object'
      ? initialPrefill.customer
      : {};
    const prefillItemsRaw = Array.isArray(initialPrefill?.items) ? initialPrefill.items : [];
    const prefillItems = prefillItemsRaw.length
      ? prefillItemsRaw.map((item, index) => normalizeBillingItem({
        id: item?.id || `prefill_item_${index}_${Date.now()}`,
        type: Number(item?.productId || item?.product_id || 0) > 0 ? 'inventory' : 'custom',
        name: String(item?.name || item?.product_name || 'Item').trim() || 'Item',
        productId: Number(item?.productId || item?.product_id || 0) || null,
        price: Math.max(0, Number(item?.price || item?.mrp || 0)),
        qty: Math.max(1, Number(item?.qty || item?.quantity || 1)),
        unit: String(item?.unit || item?.uom || 'pcs').trim() || 'pcs',
        disc: Math.max(0, Number(item?.disc || item?.discount || 0)),
        discType: 'fixed',
        linkedOrderItemId: Number(item?.linkedOrderItemId || item?.linked_order_item_id || item?.order_item_id || 0) || null,
        linkedOrderRequestedQty: Math.max(0, Number(item?.linkedOrderRequestedQty || item?.requested_qty || 0)),
        linkedOrderAvailableNowQty: Math.max(0, Number(item?.linkedOrderAvailableNowQty || item?.available_now_qty || 0)),
        linkedOrderFulfilledQty: Math.max(0, Number(item?.linkedOrderFulfilledQty || item?.fulfilled_qty || 0)),
        linkedOrderPendingQty: Math.max(0, Number(item?.linkedOrderPendingQty || item?.pending_qty || 0)),
        prefilledLineSubtotal: Math.max(0, Number(item?.prefilledLineSubtotal || item?.line_subtotal || 0)),
        prefilledOfferDiscount: Math.max(0, Number(item?.prefilledOfferDiscount || item?.offer_discount || 0)),
        prefilledManualDiscount: Math.max(0, Number(item?.prefilledManualDiscount || item?.manual_discount || 0)),
        prefilledTotalDiscount: Math.max(0, Number(item?.prefilledTotalDiscount || item?.discount || 0)),
        prefilledOfferLabel: String(item?.prefilledOfferLabel || item?.offer_label || '').trim(),
      }))
      : [];

    setCustomer({
      id: Number(prefillCustomer?.id || 0) || null,
      name: String(prefillCustomer?.name || '').trim(),
      email: String(prefillCustomer?.email || '').trim(),
      phone: String(prefillCustomer?.phone || '').trim(),
      address: String(prefillCustomer?.address || '').trim(),
    });
    setBillItems(prefillItems);
    setCurrentItem(createEmptyItem());
    setEditIndex(null);
    setSelectedBillIndex(prefillItems.length > 0 ? 0 : null);
    setLastAddedItemId(null);
    setLastRemovedItem(null);
    setPendingProductSelectionReview(false);
    clearSearchState();
    setEntryActionLocked(false);
    createBillConfirmationSignatureRef.current = '';
    setCreateBillConfirmationOpen(false);
    setClearBillConfirmationOpen(false);
    setPaidAmount(0);
    setLastShareText('');
    setLastShareNumber('');
    setLastSharePhone('');
    setLinkedOrderId(Number(initialPrefill?.source?.order_id || 0) || 0);
    setFulfillmentMode(Number(initialPrefill?.source?.order_id || 0) ? 'available_now' : 'full_now');
    setSelectedPaymentMethod('cash');

    const sourceOrderLabel = String(initialPrefill?.source?.order_number || '').trim()
      || (Number(initialPrefill?.source?.order_id || 0) ? `#${Number(initialPrefill.source.order_id)}` : '');
    setPrefillSummary(
      sourceOrderLabel
        ? `Order ${sourceOrderLabel} linked. Customer and items are auto-loaded.`
        : 'Order-linked billing loaded.'
    );

    if (typeof onPrefillApplied === 'function') onPrefillApplied(initialPrefill);
  }, [clearSearchState, initialPrefill, normalizeBillingItem, onPrefillApplied]);

  useEffect(() => {
    const handleWindowKeyDown = (event) => {
      if (showCustomerCreateModal || createBillConfirmationOpen || clearBillConfirmationOpen || isSubmitting) {
        return;
      }
      const editableTarget = isEditableElement(event.target);
      const interactiveTarget = isInteractiveElement(event.target);

      if (event.key === 'Escape') {
        if (editableTarget || (editIndex !== null && !interactiveTarget)) {
          event.preventDefault();
          handleCancelEdit();
        }
        return;
      }

      if (editableTarget || interactiveTarget) return;

      if (event.key === 'Delete' && selectedBillIndex !== null) {
        event.preventDefault();
        handleDeleteBillItem(selectedBillIndex);
        return;
      }

      if (event.key === 'ArrowDown') {
        if (billItems.length === 0) return;
        event.preventDefault();
        setSelectedBillIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, billItems.length - 1);
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        if (billItems.length === 0) return;
        event.preventDefault();
        setSelectedBillIndex((prev) => {
          if (prev === null) return 0;
          return Math.max(prev - 1, 0);
        });
        return;
      }

      if (event.key === 'Enter' && selectedBillIndex !== null) {
        event.preventDefault();
        handleSelectBillItem(selectedBillIndex);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [
    billItems.length,
    editIndex,
    handleCancelEdit,
    clearBillConfirmationOpen,
    createBillConfirmationOpen,
    handleDeleteBillItem,
    handleSelectBillItem,
    isSubmitting,
    selectedBillIndex,
    showCustomerCreateModal,
  ]);

  useEffect(() => {
    if (!createBillConfirmationOpen) return;
    if (!createBillConfirmationSignatureRef.current) return;
    if (createBillConfirmationSignatureRef.current === createBillConfirmationSignature) return;
    setCreateBillConfirmationOpen(false);
  }, [createBillConfirmationOpen, createBillConfirmationSignature]);

  const { handleCreateBill } = useBillingCreateBill({
    billingApi,
    creditApi,
    customersList,
    productsList,
    setProductsList,
    customer,
    items: billItems,
    totalBill,
    paidClamped,
    creditAmount,
    paymentMethod: effectivePaymentMethod,
    totalDiscount,
    isOrderLinked,
    linkedOrderId,
    fulfillmentMode,
    setIsSubmitting,
    setLastShareText,
    setLastShareNumber,
    setLastSharePhone,
    setPrefillSummary,
    setLinkedOrderId,
    setFulfillmentMode,
    setSelectedPaymentMethod,
    setCustomer,
    setItems: setBillItems,
    setPaidAmount,
    getProductForLine,
    resolveLineUnitForProduct,
    buildBillShareText,
    info,
    onResetEntry: () => {
      setCurrentItem(createEmptyItem());
      setEditIndex(null);
      setSelectedBillIndex(null);
      setLastAddedItemId(null);
      setLastRemovedItem(null);
      clearSearchState();
      setPendingProductSelectionReview(false);
      setProductSearchMessage('');
      setEntryActionLocked(false);
      createBillConfirmationSignatureRef.current = '';
      setCreateBillConfirmationOpen(false);
      setClearBillConfirmationOpen(false);
      focusEntryField('search');
    },
  });

  const handleCreateBillClick = useCallback(() => {
    if (billItems.length === 0) {
      setError('Add an item before saving.');
      focusEntryField('search');
      return;
    }

    if (paidAmountWarning) {
      setError(paidAmountWarning);
      return;
    }

    if (!createBillConfirmationOpen) {
      setError(null);
      setClearBillConfirmationOpen(false);
      createBillConfirmationSignatureRef.current = createBillConfirmationSignature;
      setCreateBillConfirmationOpen(true);
      return;
    }

    createBillConfirmationSignatureRef.current = '';
    setCreateBillConfirmationOpen(false);
    setError(null);
    handleCreateBill();
  }, [
    billItems.length,
    clearBillConfirmationOpen,
    createBillConfirmationSignature,
    createBillConfirmationOpen,
    focusEntryField,
    handleCreateBill,
    paidAmountWarning,
  ]);

  const getProductOptionLabelWithFormat = useCallback(
    (product) => getProductOptionLabel(product, formatCurrency),
    []
  );

  usePopupDraftPersistence({
    kind: 'billing',
    storageKey: draftStorageKey,
    enabled: popupMode,
    isDirty: billingDraftDirty,
    draft: {
      customer,
      currentItem,
      billItems,
      editIndex,
      selectedBillIndex,
      paidAmount,
      prefillSummary,
      linkedOrderId,
      fulfillmentMode,
      selectedPaymentMethod,
    },
    onRestore: (draft) => {
      const restoredBillItems = Array.isArray(draft?.billItems)
        ? draft.billItems.map((item) => normalizeBillingItem(item))
        : [];
      setCustomer({
        id: Number(draft?.customer?.id || 0) || null,
        name: String(draft?.customer?.name || '').trim(),
        email: String(draft?.customer?.email || '').trim(),
        phone: String(draft?.customer?.phone || '').trim(),
        address: String(draft?.customer?.address || '').trim(),
      });
      setCurrentItem(normalizeBillingItem(draft?.currentItem || createEmptyItem()));
      setBillItems(restoredBillItems);
      setEditIndex(
        Number.isInteger(draft?.editIndex) && draft.editIndex >= 0
          ? Math.min(draft.editIndex, Math.max(restoredBillItems.length - 1, 0))
          : null
      );
      setSelectedBillIndex(
        Number.isInteger(draft?.selectedBillIndex) && draft.selectedBillIndex >= 0
          ? Math.min(draft.selectedBillIndex, Math.max(restoredBillItems.length - 1, 0))
          : (restoredBillItems.length > 0 ? 0 : null)
      );
      setLastAddedItemId(null);
      setLastRemovedItem(null);
      setPaidAmount(draft?.paidAmount ?? 0);
      setPrefillSummary(String(draft?.prefillSummary || '').trim());
      setLinkedOrderId(Number(draft?.linkedOrderId || 0) || 0);
      setFulfillmentMode(String(draft?.fulfillmentMode || 'available_now').trim() || 'available_now');
      setSelectedPaymentMethod(String(draft?.selectedPaymentMethod || 'cash').trim() || 'cash');
      clearSearchState();
      setPendingProductSelectionReview(false);
      setProductSearchMessage('');
      setEntryActionLocked(false);
      createBillConfirmationSignatureRef.current = '';
      setCreateBillConfirmationOpen(false);
      setClearBillConfirmationOpen(false);
    },
    debounceMs: 280,
  });

  return (
    <BillingTabView
      isMobile={isMobile}
      loading={loading}
      error={error}
      prefillSummary={prefillSummary}
      isOrderLinked={isOrderLinked}
      isSubmitting={isSubmitting}
      currentItem={currentItem}
      currentProduct={currentProduct}
      pendingProductSelectionReview={pendingProductSelectionReview}
      isManualPrice={isManualPrice}
      isEntryActionLocked={entryActionLocked}
      productSearchMessage={productSearchMessage}
      hasExplicitSuggestionChoice={hasExplicitSuggestionChoice}
      currentUnitOptions={currentUnitOptions}
      productSearchInputRef={productSearchInputRef}
      priceInputRef={priceInputRef}
      qtyInputRef={qtyInputRef}
      unitInputRef={unitInputRef}
      discountInputRef={discountInputRef}
      submitButtonRef={submitButtonRef}
      productSearchResults={productSearchResults}
      recentProducts={recentProducts}
      productSearchLoading={productSearchLoading}
      activeProductSuggestionIndex={activeProductSuggestionIndex}
      getProductOptionLabel={getProductOptionLabelWithFormat}
      handleCurrentItemChange={handleCurrentItemChange}
      handleProductSearchKeyDown={handleProductSearchKeyDown}
      handleEntryFieldKeyDown={handleEntryFieldKeyDown}
      handleSelectSearchProduct={handleSelectSearchProduct}
      handleStartCustomItem={handleStartCustomItem}
      handleCommitCurrentItem={handleCommitCurrentItem}
      handleCancelEdit={handleCancelEdit}
      lowStockWarning={lowStockWarning}
      editIndex={editIndex}
      selectedBillIndex={selectedBillIndex}
      latestAddedItemId={lastAddedItemId}
      lastRemovedItem={lastRemovedItem}
      billDisplayItems={billDisplayItems}
      handleSelectBillItem={handleSelectBillItem}
      handleDeleteBillItem={handleDeleteBillItem}
      handleUndoLastRemoval={handleUndoLastRemoval}
      activeLineItemsCount={activeLineItemsCount}
      subtotalAmount={subtotalAmount}
      totalDiscount={totalDiscount}
      totalBill={totalBill}
      pricingPreviewLoading={billingPricingLoading}
      pricingPreviewError={billingPricingError}
      paidClamped={paidClamped}
      creditAmount={creditAmount}
      paidAmountWarning={paidAmountWarning}
      paymentStatusLabel={paymentStatusLabel}
      customer={customer}
      customersList={customersList}
      handleCustomerChange={handleCustomerChange}
      handleAddCustomer={handleAddCustomer}
      fulfillmentMode={fulfillmentMode}
      setFulfillmentMode={setFulfillmentMode}
      paidAmount={paidAmount}
      setPaidAmount={setPaidAmount}
      selectedPaymentMethod={selectedPaymentMethod}
      effectivePaymentMethod={effectivePaymentMethod}
      setSelectedPaymentMethod={setSelectedPaymentMethod}
      createBillConfirmationOpen={createBillConfirmationOpen}
      clearBillConfirmationOpen={clearBillConfirmationOpen}
      handleSelectCashPayment={handleSelectCashPayment}
      handleSelectUpiPayment={handleSelectUpiPayment}
      handleSelectCreditPayment={handleSelectCreditPayment}
      onClear={handleClear}
      onCancelCreateBill={handleCancelCreateBillConfirmation}
      onCancelClearBill={handleCancelClearBillConfirmation}
      handleCreateBill={handleCreateBillClick}
      lastShareText={lastShareText}
      lastShareNumber={lastShareNumber}
      handleCopyShare={handleCopyShare}
      handleSendWhatsApp={handleSendWhatsApp}
      showCustomerCreateModal={showCustomerCreateModal}
      handleCustomerModalClose={handleCustomerModalClose}
      handleCustomerModalSave={handleCustomerModalSave}
      customerCreateName={String(customer?.name || '').trim()}
    />
  );
};

export default BillingTabController;
