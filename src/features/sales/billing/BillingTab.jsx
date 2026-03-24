import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { productsApi, billingApi, creditApi } from '../../../shared/services/api';
import { sendWhatsAppSmart } from '../../../shared/utils/whatsapp';
import { formatCurrency } from '../../../shared/utils/formatters';
import { validateAmountInput } from '../../../shared/utils/amountExpression';
import { buildBillShareText } from '../../../shared/utils/messageTemplates';
import { safeSessionStorageGet, safeSessionStorageSet } from '../../../shared/utils/storage';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import useProductSearchCombobox from '../../../shared/hooks/useProductSearchCombobox';
import usePopupDraftPersistence from '../../../shared/hooks/usePopupDraftPersistence';
import useOfferPricingPreview from '../../../shared/hooks/useOfferPricingPreview';
import * as info from '../../../shared/info';
import {
  getPreviewLineMap,
} from '../../../shared/utils/offers';
import BillingTabView from './components/BillingTabView';
import {
  createEmptyItem,
  getProductDefaultPrice,
  getProductOptionLabel,
  getStockWarningMeta,
} from './utils/billingLineItemUtils';
import { calculateLineAmount } from './utils/billingAmountUtils';
import {
  getAllowedUnitsForProduct,
  resolveLineUnitForProduct,
  toPricingQtyFromProduct,
} from './utils/billingUnitUtils';
import useBillingCreateBill from './hooks/useBillingCreateBill';
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
const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;
const getBillingItemType = (item = {}) => {
  const productId = Number(item?.productId || item?.product_id || 0);
  if (productId > 0) return 'inventory';
  if (String(item?.type || '').trim().toLowerCase() === 'custom' || Boolean(item?.isCustom)) {
    return 'custom';
  }
  return 'inventory';
};

const getLinkedOrderRequestedQty = (item = {}) =>
  Math.max(1, Number(item?.linkedOrderRequestedQty ?? item?.requestedQty ?? item?.qty ?? 1) || 1);

const getLinkedOrderFulfilledQty = (item = {}) =>
  Math.max(
    0,
    Number(item?.linkedOrderFulfilledQty ?? item?.linkedOrderAvailableNowQty ?? item?.availableNowQty ?? item?.fulfilledQty ?? 0) || 0
  );

const getEffectiveBillingQty = ({ item = {}, linkedOrderId = 0, fulfillmentMode = 'full_now' } = {}) => {
  const enteredQty = Math.max(1, Number(item?.qty || 1) || 1);
  if (!linkedOrderId || fulfillmentMode !== 'available_now') return enteredQty;
  return Math.max(0, Math.min(enteredQty, getLinkedOrderFulfilledQty(item)));
};

const canMergeBillItems = (existingItem = {}, nextItem = {}) => {
  if (getBillingItemType(existingItem) !== 'inventory' || getBillingItemType(nextItem) !== 'inventory') {
    return false;
  }

  const existingProductId = Number(existingItem?.productId || existingItem?.product_id || 0);
  const nextProductId = Number(nextItem?.productId || nextItem?.product_id || 0);
  if (existingProductId <= 0 || nextProductId <= 0) return false;
  if (existingProductId !== nextProductId) return false;

  return (
    normalizeLookupKey(existingItem?.unit || 'pcs') === normalizeLookupKey(nextItem?.unit || 'pcs')
    && roundMoney(existingItem?.price) === roundMoney(nextItem?.price)
    && String(existingItem?.discType || 'fixed') === String(nextItem?.discType || 'fixed')
    && roundMoney(existingItem?.disc) === roundMoney(nextItem?.disc)
  );
};

const BillingSystem = ({
  initialPrefill = null,
  onPrefillApplied = null,
  shortcutFocusRequest = 0,
  onShortcutFocusHandled = null,
  popupMode = false,
  draftStorageKey = '',
}) => {
  const isMobile = useIsMobile();
  const [customer, setCustomer] = useState({ id: null, name: '', email: '', phone: '', address: '' });
  const [currentItem, setCurrentItem] = useState(() => createEmptyItem());
  const [billItems, setBillItems] = useState([]);
  const [editIndex, setEditIndex] = useState(null);
  const [selectedBillIndex, setSelectedBillIndex] = useState(null);
  const [lastAddedItemId, setLastAddedItemId] = useState(null);
  const [lastRemovedItem, setLastRemovedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [lastShareText, setLastShareText] = useState('');
  const [lastShareNumber, setLastShareNumber] = useState('');
  const [lastSharePhone, setLastSharePhone] = useState('');
  const [prefillSummary, setPrefillSummary] = useState('');
  const [linkedOrderId, setLinkedOrderId] = useState(0);
  const [fulfillmentMode, setFulfillmentMode] = useState('available_now');
  const [showCustomerCreateModal, setShowCustomerCreateModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [customersList, setCustomersList] = useState([]);
  const [productsList, setProductsList] = useState([]);
  const [pendingProductSelectionReview, setPendingProductSelectionReview] = useState(false);
  const [productSearchMessage, setProductSearchMessage] = useState('');
  const [createBillConfirmationOpen, setCreateBillConfirmationOpen] = useState(false);
  const [clearBillConfirmationOpen, setClearBillConfirmationOpen] = useState(false);
  const [entryActionLocked, setEntryActionLocked] = useState(false);

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
          productsApi.getAll(),
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

  const currentProduct = useMemo(() => getProductForLine(currentItem), [currentItem, getProductForLine]);
  const currentUnitOptions = useMemo(() => {
    if (currentProduct) return getAllowedUnitsForProduct(currentProduct);
    const currentUnit = String(currentItem?.unit || 'pcs').trim() || 'pcs';
    return [currentUnit, ...DEFAULT_UNIT_OPTIONS.filter((unitOption) => unitOption !== currentUnit)];
  }, [currentItem?.unit, currentProduct]);

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

  const resetEntryForm = useCallback((options = {}) => {
    setCurrentItem(createEmptyItem());
    setEditIndex(null);
    clearSearchState();
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setEntryActionLocked(false);
    if (options.clearError !== false) {
      setError(null);
    }
    if (options.focusField !== false) {
      focusEntryField('search');
    }
  }, [clearSearchState, focusEntryField]);

  const handleCurrentItemChange = useCallback((field, value) => {
    if (['name', 'price', 'qty', 'unit', 'disc'].includes(field)) {
      setPendingProductSelectionReview(false);
    }
    setClearBillConfirmationOpen(false);
    if (field === 'name') {
      setProductSearchMessage('');
      setHasExplicitSuggestionChoice(false);
    }
    setCurrentItem((prev) => {
      if (field === 'name') {
        const rawValue = String(value || '');
        const previousProduct = getProductForLine(prev);
        const previousStillMatches = previousProduct && [
          normalizeLookupKey(previousProduct?.name),
          normalizeLookupKey(previousProduct?.sku),
          normalizeLookupKey(previousProduct?.barcode),
        ].includes(normalizeLookupKey(rawValue));
        const nextIsCustom = rawValue.trim()
          ? Boolean(prev?.isCustom) && !previousStillMatches
          : false;

        return {
          ...prev,
          name: nextIsCustom ? normalizeCustomItemName(rawValue) : rawValue,
          productId: previousStillMatches ? prev.productId : null,
          type: rawValue.trim() ? (nextIsCustom ? 'custom' : 'inventory') : 'inventory',
          isCustom: nextIsCustom,
        };
      }

      if (field === 'price') {
        return normalizeBillingItem({ ...prev, price: value });
      }

      if (field === 'qty') {
        return normalizeBillingItem({ ...prev, qty: value });
      }

      if (field === 'unit') {
        return normalizeBillingItem({ ...prev, unit: value });
      }

      if (field === 'disc') {
        return normalizeBillingItem({ ...prev, disc: value });
      }

      if (field === 'discType') {
        return normalizeBillingItem({ ...prev, discType: 'fixed' });
      }

      return normalizeBillingItem({ ...prev, [field]: value });
    });
    setError(null);
  }, [
    getProductForLine,
    normalizeBillingItem,
  ]);

  const handleSelectSearchProduct = useCallback((product, focusField = 'qty') => {
    if (!product) return null;
    const nextItem = buildBillingItemFromProduct(product, currentItem);
    setCurrentItem(nextItem);
    setProductsList((prev) => mergeProductsById(prev, [product]));
    clearSearchState();
    setClearBillConfirmationOpen(false);
    setPendingProductSelectionReview(true);
    setProductSearchMessage('');
    setError(null);
    lockEntryActions(200);
    if (focusField) {
      focusEntryField(focusField, {
        select: focusField === 'price' || focusField === 'qty' || focusField === 'disc',
      });
    }
    return nextItem;
  }, [buildBillingItemFromProduct, clearSearchState, currentItem, focusEntryField, lockEntryActions, setProductsList]);

  const getCurrentItemValidationError = useCallback((item, options = {}) => {
    const draft = normalizeBillingItem(item);
    const allowMissingProduct = getBillingItemType(draft) === 'custom';
    const product = getProductForLine(draft);
    const pricingQty = toPricingQtyFromProduct(draft.qty, draft.unit, product);
    const lineSubtotal = roundMoney((Number(draft?.price || 0) || 0) * pricingQty);
    const discountValue = Math.max(0, Number(draft?.disc ?? draft?.discount ?? 0) || 0);

    if (!String(draft?.name || '').trim()) {
      return 'Product or custom name is required.';
    }
    if (Number(draft?.qty || 0) <= 0) {
      return 'Quantity must be at least 1.';
    }
    if (discountValue > lineSubtotal) {
      return 'Discount cannot exceed the item total.';
    }
    if (Number(draft?.amount || 0) <= 0) {
      return 'Line total must be greater than zero.';
    }
    if (!allowMissingProduct && !draft?.isCustom && !Number(draft?.productId || 0)) {
      return 'Pick a product from search or use Add Custom Item.';
    }
    return '';
  }, [getProductForLine, normalizeBillingItem, toPricingQtyFromProduct]);

  const handleStartCustomItem = useCallback((rawName = '') => {
    const trimmedName = normalizeCustomItemName(rawName);
    if (!trimmedName) return;

    setCurrentItem((prev) => normalizeBillingItem({
      ...prev,
      type: 'custom',
      name: trimmedName,
      productId: null,
      isCustom: true,
    }));
    clearSearchState();
    setClearBillConfirmationOpen(false);
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setError(null);
    lockEntryActions(200);
    focusEntryField('qty', { select: true });
  }, [clearSearchState, focusEntryField, lockEntryActions, normalizeBillingItem]);

  const handleCommitCurrentItem = useCallback((options = {}) => {
    const force = Boolean(options?.force);
    if (entryActionLocked) return false;
    let nextItem = normalizeBillingItem(options?.draftItem || currentItem);

    if (!Number(nextItem?.productId || 0)) {
      const exactMatch = resolveExactProductMatch(nextItem?.name, productSearchResults);
      if (exactMatch && getBillingItemType(nextItem) !== 'custom') {
        nextItem = buildBillingItemFromProduct(exactMatch, nextItem);
      }
    }

    nextItem = normalizeBillingItem(nextItem);

    if (
      pendingProductSelectionReview
      && !force
      && getBillingItemType(nextItem) === 'inventory'
      && Number(nextItem?.productId || 0) > 0
    ) {
      setError('Selected product is ready. Press Enter in Qty or review the line before adding.');
      focusEntryField('qty', { select: true });
      return false;
    }

    const validationError = getCurrentItemValidationError(nextItem, { force });
    if (validationError) {
      setError(validationError);
      return false;
    }

    setError(null);
    const persistedItem = {
      ...nextItem,
      id: nextItem?.id || createEmptyItem().id,
    };
    let nextSelectedBillIndex = editIndex === null ? 0 : editIndex;
    let nextLastAddedItemId = editIndex === null ? persistedItem.id : null;

    setBillItems((prev) => {
      if (editIndex === null) {
        const mergeIndex = prev.findIndex((entry) => canMergeBillItems(entry, persistedItem));
        if (mergeIndex >= 0) {
          const mergeTarget = prev[mergeIndex];
          const mergedItem = normalizeBillingItem({
            ...mergeTarget,
            ...persistedItem,
            id: mergeTarget.id,
            qty: Number(mergeTarget?.qty || 0) + Number(persistedItem?.qty || 0),
          });
          const remainingItems = prev.filter((_, index) => index !== mergeIndex);
          nextSelectedBillIndex = 0;
          nextLastAddedItemId = mergeTarget.id;
          return [mergedItem, ...remainingItems];
        }
        return [persistedItem, ...prev];
      }
      return prev.map((entry, index) => (index === editIndex ? persistedItem : entry));
    });
    setSelectedBillIndex(nextSelectedBillIndex);
    setLastAddedItemId(nextLastAddedItemId);
    setLastRemovedItem(null);
    setCurrentItem(createEmptyItem());
    setEditIndex(null);
    clearSearchState();
    setClearBillConfirmationOpen(false);
    setPendingProductSelectionReview(false);
    lockEntryActions(200);
    focusEntryField('search');
    return true;
  }, [
    buildBillingItemFromProduct,
    currentItem,
    clearSearchState,
    editIndex,
    entryActionLocked,
    focusEntryField,
    getCurrentItemValidationError,
    lockEntryActions,
    normalizeBillingItem,
    pendingProductSelectionReview,
    productSearchResults,
    resolveExactProductMatch,
  ]);

  const handleCancelEdit = useCallback(() => {
    resetEntryForm();
  }, [resetEntryForm]);

  const handleSelectBillItem = useCallback((index) => {
    const item = billItems[index];
    if (!item) return;

    setCurrentItem(normalizeBillingItem(item));
    setEditIndex(index);
    setSelectedBillIndex(index);
    clearSearchState();
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setClearBillConfirmationOpen(false);
    setError(null);
    focusEntryField('search');
  }, [billItems, clearSearchState, focusEntryField, normalizeBillingItem]);

  const handleDeleteBillItem = useCallback((index) => {
    const removedItem = billItems[index];
    if (!removedItem) return;

    setBillItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setLastRemovedItem({ item: removedItem, index });
    setClearBillConfirmationOpen(false);
    if (removedItem.id === lastAddedItemId) {
      setLastAddedItemId(null);
    }

    if (editIndex === index) {
      resetEntryForm();
    } else if (editIndex !== null && editIndex > index) {
      setEditIndex(editIndex - 1);
    }

    const nextLength = billItems.length - 1;
    if (nextLength <= 0) {
      setSelectedBillIndex(null);
      return;
    }

    if (selectedBillIndex === null) {
      setSelectedBillIndex(0);
      return;
    }

    if (selectedBillIndex === index) {
      setSelectedBillIndex(Math.min(index, nextLength - 1));
      return;
    }

    if (selectedBillIndex > index) {
      setSelectedBillIndex(selectedBillIndex - 1);
    }
  }, [
    billItems,
    editIndex,
    lastAddedItemId,
    resetEntryForm,
    selectedBillIndex,
  ]);

  const handleUndoLastRemoval = useCallback(() => {
    if (!lastRemovedItem?.item) return;

    setBillItems((prev) => {
      const nextItems = [...prev];
      const insertAt = Math.min(lastRemovedItem.index, nextItems.length);
      nextItems.splice(insertAt, 0, lastRemovedItem.item);
      return nextItems;
    });
    setSelectedBillIndex(lastRemovedItem.index);
    setLastRemovedItem(null);
    setClearBillConfirmationOpen(false);
    setProductSearchMessage('');
    focusEntryField('search');
  }, [focusEntryField, lastRemovedItem]);

  const handleProductSearchKeyDown = useCallback((event) => {
    const handleSearchEnter = () => {
      const query = normalizeLookupKey(currentItem?.name);
      const highlightedProduct = resolveHighlightedProduct();
      const exactMatch = resolveExactProductMatch(currentItem?.name, productSearchResults);
      const exactCodeMatch = exactMatch && [
        normalizeLookupKey(exactMatch?.sku),
        normalizeLookupKey(exactMatch?.barcode),
      ].includes(query);

      if (exactCodeMatch) {
        handleSelectSearchProduct(exactMatch, 'qty');
        return;
      }

      if (productSearchResults.length === 1 && highlightedProduct) {
        handleSelectSearchProduct(highlightedProduct, 'qty');
        return;
      }

      if (productSearchResults.length > 1) {
        if (hasExplicitSuggestionChoice && highlightedProduct) {
          handleSelectSearchProduct(highlightedProduct, 'qty');
          return;
        }
        setProductSearchMessage('Multiple products found. Use Arrow keys or click to select the correct item.');
        return;
      }

      if (Number(currentItem?.productId || 0) > 0) {
        focusEntryField('qty', { select: true });
        return;
      }

      if (productSearchLoading) {
        setProductSearchMessage('Searching products. Press Enter again when results appear.');
        return;
      }

      if (String(currentItem?.name || '').trim()) {
        handleStartCustomItem(currentItem?.name);
      }
    };

    const highlightedProduct = resolveHighlightedProduct();
    const hasTypedQuery = Boolean(String(currentItem?.name || '').trim());

    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (entryActionLocked) return;
      if (!Number(currentItem?.productId || 0) && hasTypedQuery) {
        handleStartCustomItem(currentItem?.name);
        return;
      }
      handleCommitCurrentItem({ force: true });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEdit();
      return;
    }

    if (event.key === 'ArrowDown') {
      if (!productSearchResults.length) return;
      event.preventDefault();
      setHasExplicitSuggestionChoice(true);
      setProductSearchMessage('');
      setError(null);
      setActiveProductSuggestionIndex((prev) => Math.min(prev + 1, productSearchResults.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      if (!productSearchResults.length) return;
      event.preventDefault();
      setHasExplicitSuggestionChoice(true);
      setProductSearchMessage('');
      setError(null);
      setActiveProductSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (
      event.key === 'Tab'
      && !event.shiftKey
      && !event.ctrlKey
      && !event.altKey
      && !event.metaKey
      && !Number(currentItem?.productId || 0)
      && hasTypedQuery
    ) {
      if (productSearchResults.length > 1 && !hasExplicitSuggestionChoice) {
        event.preventDefault();
        setProductSearchMessage('Multiple products found. Use Arrow keys or click to select the correct item.');
        return;
      }
      if (!highlightedProduct) {
        event.preventDefault();
        setProductSearchMessage(
          productSearchLoading
            ? 'Searching products. Wait for results or press Enter to add a custom item.'
            : 'No exact product match yet. Press Enter to add a custom item or keep typing.'
        );
        return;
      }
      event.preventDefault();
      setProductSearchMessage('');
      handleSelectSearchProduct(highlightedProduct, 'qty');
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    if (entryActionLocked) return;
    setProductSearchMessage('');
    handleSearchEnter();
  }, [
    currentItem,
    entryActionLocked,
    focusEntryField,
    hasExplicitSuggestionChoice,
    handleCancelEdit,
    handleCommitCurrentItem,
    handleSelectSearchProduct,
    handleStartCustomItem,
    productSearchLoading,
    productSearchResults,
    resolveExactProductMatch,
    resolveHighlightedProduct,
  ]);

  const handleEntryFieldKeyDown = useCallback((field) => (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (entryActionLocked) return;
      handleCommitCurrentItem({ force: true });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEdit();
      return;
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    if (entryActionLocked) return;

    if (pendingProductSelectionReview) {
      setPendingProductSelectionReview(false);
    }

    const hasResolvedPrice = Number(currentItem?.price || 0) > 0;

    if (field === 'qty') {
      if (!event.shiftKey && hasResolvedPrice) {
        handleCommitCurrentItem();
        return;
      }

      focusEntryField('price', { select: true });
      return;
    }

    if (field === 'price') {
      if (event.shiftKey) {
        focusEntryField('disc', { select: true });
        return;
      }

      if (hasResolvedPrice) {
        handleCommitCurrentItem();
        return;
      }
    }

    const nextFieldByCurrentField = {
      disc: 'submit',
      unit: 'submit',
    };
    const nextField = nextFieldByCurrentField[field];

    if (nextField === 'submit') {
      handleCommitCurrentItem();
      return;
    }

    focusEntryField(nextField, {
      select: nextField === 'qty' || nextField === 'price' || nextField === 'disc',
    });
  }, [
    currentItem?.price,
    entryActionLocked,
    focusEntryField,
    handleCancelEdit,
    handleCommitCurrentItem,
    pendingProductSelectionReview,
  ]);

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

  const billingPreviewItems = useMemo(() => billItems.map((item) => {
    const product = getProductForLine(item);
    const itemType = getBillingItemType(item);
    const defaultPrice = product ? roundMoney(getProductDefaultPrice(product)) : roundMoney(item?.price || 0);
    const currentPrice = roundMoney(item?.price || 0);
    const effectiveQty = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const skipOffers = Boolean(item?.skipOffers) || itemType === 'custom' || (product ? currentPrice !== defaultPrice : false);
    return {
      client_item_id: item?.id,
      product_id: Number(item?.productId || item?.product_id || 0) || null,
      product_name: String(item?.name || item?.product_name || '').trim(),
      quantity: effectiveQty,
      qty: effectiveQty,
      unit: String(item?.unit || 'pcs').trim() || 'pcs',
      item_type: itemType === 'custom' ? 'custom' : 'catalog',
      unit_price_override: skipOffers ? currentPrice : undefined,
      manual_discount: Math.max(0, Number(item?.disc || item?.discount || 0) || 0),
      skip_offers: skipOffers,
    };
  }), [billItems, fulfillmentMode, getProductForLine, linkedOrderId]);
  const {
    preview: billingPricingPreview,
    loading: billingPricingLoading,
    error: billingPricingError,
  } = useOfferPricingPreview({
    items: billingPreviewItems,
    context: 'billing',
    offerContext: {
      customer_user_id: Number(customer?.id || 0) || null,
      exclude_order_id: Number(linkedOrderId || 0) || null,
    },
    enabled: billItems.length > 0,
  });
  const billingPricingLineMap = useMemo(
    () => getPreviewLineMap(billingPricingPreview),
    [billingPricingPreview]
  );

  const localSubtotalAmount = useMemo(() => roundMoney(billItems.reduce((sum, item) => {
    const priceNum = Number(item.price) || 0;
    const qtyNum = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const requestedQty = getLinkedOrderRequestedQty(item);
    const qtyRatio = requestedQty > 0 ? (qtyNum / requestedQty) : 0;
    const product = getProductForLine(item);
    const pricingQty = toPricingQtyFromProduct(qtyNum, item.unit, product);
    if (Number(item?.prefilledLineSubtotal || 0) > 0 && linkedOrderId) {
      return sum + roundMoney(Number(item.prefilledLineSubtotal || 0) * qtyRatio);
    }
    return sum + (priceNum * pricingQty);
  }, 0)), [billItems, fulfillmentMode, getProductForLine, linkedOrderId, toPricingQtyFromProduct]);

  const localTotalDiscount = useMemo(() => roundMoney(billItems.reduce((sum, item) => {
    const priceNum = Number(item.price) || 0;
    const qtyNum = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const requestedQty = getLinkedOrderRequestedQty(item);
    const qtyRatio = requestedQty > 0 ? (qtyNum / requestedQty) : 0;
    const product = getProductForLine(item);
    const pricingQty = toPricingQtyFromProduct(qtyNum, item.unit, product);
    const discNum = Number(item.disc) || 0;
    if (Number(item?.prefilledTotalDiscount || 0) > 0 && linkedOrderId) {
      return sum + roundMoney(Number(item.prefilledTotalDiscount || 0) * qtyRatio);
    }
    if (item.discType === 'percentage') {
      const validDiscPercent = Math.min(100, Math.max(0, discNum));
      return sum + (priceNum * pricingQty * validDiscPercent) / 100;
    }
    return sum + Math.min(priceNum * pricingQty, Math.max(0, discNum));
  }, 0)), [billItems, fulfillmentMode, getProductForLine, linkedOrderId, toPricingQtyFromProduct]);

  const localTotalBill = useMemo(
    () => roundMoney(Math.max(0, localSubtotalAmount - localTotalDiscount)),
    [localSubtotalAmount, localTotalDiscount]
  );
  const subtotalAmount = Number.isFinite(Number(billingPricingPreview?.summary?.base_subtotal))
    ? roundMoney(Number(billingPricingPreview.summary.base_subtotal))
    : localSubtotalAmount;
  const totalDiscount = Number.isFinite(Number(billingPricingPreview?.summary?.discount_total))
    ? roundMoney(Number(billingPricingPreview.summary.discount_total))
    : localTotalDiscount;
  const totalBill = Number.isFinite(Number(billingPricingPreview?.summary?.net_subtotal))
    ? roundMoney(Number(billingPricingPreview.summary.net_subtotal))
    : localTotalBill;
  const paidAmountEvaluation = useMemo(
    () => validateAmountInput(paidAmount, { min: 0, max: totalBill }),
    [paidAmount, totalBill]
  );
  const hasPaidAmountInput = String(paidAmount ?? '').trim() !== '';
  const paidAmountWarning = hasPaidAmountInput && !paidAmountEvaluation.valid
    ? (paidAmountEvaluation.message || 'Paid amount is invalid.')
    : '';
  const paidResolved = paidAmountEvaluation.valid ? Number(paidAmountEvaluation.value) : 0;
  const paidClamped = roundMoney(Math.max(0, Math.min(paidResolved, Number(totalBill || 0))));
  const creditAmount = roundMoney(Math.max(0, Number(totalBill) - paidClamped));
  const paymentIntent = totalBill <= 0
    ? 'full_payment'
    : paidClamped <= 0
      ? 'full_credit'
      : paidClamped >= totalBill
        ? 'full_payment'
        : 'partial_payment';
  const effectivePaymentMethod = paymentIntent === 'full_credit'
    ? 'credit'
    : selectedPaymentMethod;
  const isOrderLinked = Number(linkedOrderId || 0) > 0;
  const activeLineItemsCount = billItems.length;
  const paymentStatusLabel = creditAmount > 0
    ? (paidClamped > 0 ? 'Partially Paid' : 'Credit Due')
    : 'Fully Paid';

  const lowStockWarning = useMemo(() => {
    if (!currentProduct) return null;
    const pricingQty = toPricingQtyFromProduct(currentItem?.qty, currentItem?.unit, currentProduct);
    return getStockWarningMeta(currentProduct, pricingQty);
  }, [currentItem?.qty, currentItem?.unit, currentProduct, toPricingQtyFromProduct]);

  const isManualPrice = useMemo(() => {
    if (!currentProduct || getBillingItemType(currentItem) !== 'inventory') return false;
    return roundMoney(currentItem?.price) !== roundMoney(getProductDefaultPrice(currentProduct));
  }, [currentItem, currentProduct]);
  const billDisplayItems = useMemo(() => billItems.map((item) => {
    const product = getProductForLine(item);
    const effectiveQty = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const pricingQty = toPricingQtyFromProduct(effectiveQty, item.unit, product);
    const isCustomItem = getBillingItemType(item) === 'custom';
    const previewLine = billingPricingLineMap.get(String(item?.id)) || null;
    const fallbackOfferDiscount = Math.max(0, Number(item?.prefilledOfferDiscount || 0));
    const fallbackManualDiscount = Math.max(0, Number(item?.prefilledManualDiscount || item?.disc || 0));
    const fallbackTotalDiscount = Math.max(
      0,
      Number(item?.prefilledTotalDiscount || (fallbackOfferDiscount + fallbackManualDiscount) || 0)
    );
    const fallbackOfferLabel = String(item?.prefilledOfferLabel || '').trim();
    const resolvedAmount = effectiveQty <= 0 && !previewLine
      ? 0
      : Number(previewLine?.line_total ?? item.amount ?? 0);
    const stockWarning = isCustomItem ? null : getStockWarningMeta(product, pricingQty);
    const cost = Number(product?.buy_price ?? product?.cost_price ?? product?.purchase_price ?? 0);
    const profitValue = Number.isFinite(cost) && cost > 0
      ? resolvedAmount - (cost * pricingQty)
      : null;
    const priceUnit =
      String(product?.base_unit || product?.uom || product?.unit || item.unit || 'pcs').trim() || 'pcs';
    const requestedQty = getLinkedOrderRequestedQty(item);
    const linkedPendingQty = Math.max(0, Number(item?.linkedOrderPendingQty || 0));
    const qtyRatio = requestedQty > 0 ? (effectiveQty / requestedQty) : 0;

    return {
      ...item,
      amount: resolvedAmount,
      effectiveQty,
      requestedQty,
      linkedPendingQty,
      isPartialLinkedBilling: Boolean(
        linkedOrderId
        && fulfillmentMode === 'available_now'
        && requestedQty > effectiveQty
      ),
      isCustomItem,
      isManualPrice: !isCustomItem && product
        ? roundMoney(item?.price) !== roundMoney(getProductDefaultPrice(product))
        : false,
      stockWarning,
      profitValue,
      priceUnit,
      lineSubtotal: Number(
        previewLine?.line_subtotal
        ?? (Number(item?.prefilledLineSubtotal || 0) > 0 ? roundMoney(Number(item.prefilledLineSubtotal || 0) * qtyRatio) : 0)
      ),
      offerDiscount: Number(previewLine?.auto_offer_discount ?? roundMoney(fallbackOfferDiscount * qtyRatio)),
      manualDiscount: Number(previewLine?.manual_discount ?? roundMoney(fallbackManualDiscount * qtyRatio)),
      totalDiscount: Number(previewLine?.line_discount_total ?? roundMoney(fallbackTotalDiscount * qtyRatio)),
      appliedOfferLabel: String(previewLine?.best_offer_label || fallbackOfferLabel).trim(),
    };
  }), [billItems, billingPricingLineMap, fulfillmentMode, getProductForLine, linkedOrderId, toPricingQtyFromProduct]);

  const createBillConfirmationSignature = useMemo(() => JSON.stringify({
    customerId: Number(customer?.id || 0) || null,
    customerName: String(customer?.name || '').trim(),
    effectivePaymentMethod,
    paidClamped,
    creditAmount,
    totalBill,
    items: billItems.map((item) => ({
      id: item?.id,
      type: item?.type,
      productId: item?.productId,
      name: item?.name,
      qty: item?.qty,
      price: item?.price,
      disc: item?.disc,
      amount: item?.amount,
    })),
  }), [
    billItems,
    creditAmount,
    customer?.id,
    customer?.name,
    effectivePaymentMethod,
    paidClamped,
    totalBill,
  ]);

  const billingDraftDirty = Boolean(
    popupMode
    && (
      String(customer?.name || '').trim()
      || String(customer?.phone || '').trim()
      || String(customer?.email || '').trim()
      || String(customer?.address || '').trim()
      || billItems.length > 0
      || String(currentItem?.name || '').trim()
      || Number(currentItem?.price || 0) > 0
      || Number(currentItem?.disc || 0) > 0
      || Math.max(1, Number(currentItem?.qty || 1)) !== 1
      || String(currentItem?.unit || 'pcs').trim().toLowerCase() !== 'pcs'
      || Number(paidAmount || 0) > 0
      || String(selectedPaymentMethod || 'cash').trim().toLowerCase() !== 'cash'
      || String(fulfillmentMode || 'available_now').trim().toLowerCase() !== 'available_now'
      || Number(linkedOrderId || 0) > 0
      || String(prefillSummary || '').trim()
    )
  );

  const handleSelectCashPayment = useCallback(() => {
    setClearBillConfirmationOpen(false);
    setSelectedPaymentMethod('cash');
    setPaidAmount(totalBill > 0 ? Number(totalBill.toFixed(2)) : 0);
  }, [totalBill]);

  const handleSelectUpiPayment = useCallback(() => {
    setClearBillConfirmationOpen(false);
    setSelectedPaymentMethod('upi');
    setPaidAmount(totalBill > 0 ? Number(totalBill.toFixed(2)) : 0);
  }, [totalBill]);

  const handleSelectCreditPayment = useCallback(() => {
    setClearBillConfirmationOpen(false);
    setPaidAmount(0);
  }, []);

  useEffect(() => {
    if (!createBillConfirmationOpen) return;
    if (!createBillConfirmationSignatureRef.current) return;
    if (createBillConfirmationSignatureRef.current === createBillConfirmationSignature) return;
    setCreateBillConfirmationOpen(false);
  }, [createBillConfirmationOpen, createBillConfirmationSignature]);

  const handleCustomerChange = useCallback((event) => {
    const { value } = event.target;
    setClearBillConfirmationOpen(false);

    if (customerSearchTimeout.current) {
      clearTimeout(customerSearchTimeout.current);
    }

    const exactMatch = customersList.find((entry) =>
      normalizeLookupKey(entry?.name) === normalizeLookupKey(value)
    );
    if (exactMatch) {
      setCustomer({ ...exactMatch });
      return;
    }

    setCustomer({ id: null, name: value, email: '', phone: '', address: '' });

    if (String(value || '').trim().length >= 2) {
      customerSearchTimeout.current = setTimeout(async () => {
        try {
          const searchResults = await billingApi.searchCustomers(value);
          const list = Array.isArray(searchResults) ? searchResults : [];
          if (list.length > 0) {
            setCustomersList((prev) => mergeCustomersById(prev, list));
            const matched = list.find(
              (entry) => normalizeLookupKey(entry?.name) === normalizeLookupKey(value)
            );
            if (matched) {
              setCustomer({ ...matched });
            }
          }
        } catch (err) {
          console.error('Error searching customers:', err);
        }
      }, 250);
    }
  }, [customersList]);

  const handleAddCustomer = useCallback(() => {
    if (isOrderLinked) return;
    const name = String(customer?.name || '').trim();
    const existing = customersList.find(
      (entry) => normalizeLookupKey(entry?.name) === normalizeLookupKey(name)
    );
    if (existing) {
      setCustomer({ ...existing });
      alert('Existing customer selected.');
      return;
    }
    setShowCustomerCreateModal(true);
  }, [customer?.name, customersList, isOrderLinked]);

  const handleCustomerModalSave = useCallback(async (createdUser = null) => {
    try {
      const createdId = Number(createdUser?.id || createdUser?.user_id || 0);
      const createdName = String(createdUser?.name || '').trim().toLowerCase();
      let matched = createdUser && createdId > 0
        ? {
          id: createdId,
          name: String(createdUser?.name || '').trim(),
          email: String(createdUser?.email || '').trim(),
          phone: String(createdUser?.phone || '').trim(),
          address: String(createdUser?.address || '').trim(),
        }
        : null;

      if (!matched && createdName) {
        const latestCustomers = await billingApi.searchCustomers(createdName);
        const list = Array.isArray(latestCustomers) ? latestCustomers : [];
        setCustomersList((prev) => mergeCustomersById(prev, list));
        matched = list.find(
          (entry) => normalizeLookupKey(entry?.name) === createdName
        ) || null;
      }

      if (matched) {
        setCustomersList((prev) => mergeCustomersById(prev, [matched]));
        setCustomer({ ...matched });
      }
    } catch (err) {
      alert(`Customer created, but refresh failed: ${err.message || 'Unknown error'}`);
    } finally {
      focusEntryField('search');
    }
  }, [focusEntryField]);

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
      setError('Add at least one item before creating the bill.');
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

  const handleCopyShare = useCallback(async () => {
    if (!lastShareText) return;
    try {
      await navigator.clipboard.writeText(lastShareText);
      alert('Bill text copied.');
    } catch (_) {
      alert('Failed to copy bill text.');
    }
  }, [lastShareText]);

  const handleSendWhatsApp = useCallback(async () => {
    if (!lastShareText) return;
    const result = await sendWhatsAppSmart({
      phone: lastSharePhone || customer?.phone,
      text: lastShareText,
    });
    if (result.status === 'missing_phone') {
      alert('Customer phone is missing or invalid. Please update phone and try again.');
      return;
    }
    if (result.status === 'fallback_copy') {
      alert('Message was long, copied to clipboard. Paste it in WhatsApp.');
      return;
    }
    if (result.status === 'fallback_no_copy') {
      alert('Message was long. Opened WhatsApp chat, please paste the message manually.');
    }
  }, [customer?.phone, lastSharePhone, lastShareText]);

  const getProductOptionLabelWithFormat = useCallback(
    (product) => getProductOptionLabel(product, formatCurrency),
    []
  );

  const handleClear = useCallback(() => {
    const hasDraftContent = Boolean(
      billItems.length > 0
      || String(customer?.name || '').trim()
      || String(customer?.phone || '').trim()
      || String(customer?.email || '').trim()
      || String(customer?.address || '').trim()
      || String(currentItem?.name || '').trim()
      || Number(currentItem?.price || 0) > 0
      || Number(currentItem?.disc || 0) > 0
      || Math.max(1, Number(currentItem?.qty || 1)) !== 1
      || String(paidAmount ?? '').trim()
    );

    if (!hasDraftContent) {
      focusEntryField('search');
      return;
    }

    if (!clearBillConfirmationOpen) {
      setCreateBillConfirmationOpen(false);
      setClearBillConfirmationOpen(true);
      return;
    }

    setCustomer({ id: null, name: '', email: '', phone: '', address: '' });
    setCurrentItem(createEmptyItem());
    setBillItems([]);
    setEditIndex(null);
    setSelectedBillIndex(null);
    setLastAddedItemId(null);
    setLastRemovedItem(null);
    setPaidAmount(0);
    setPrefillSummary('');
    setLinkedOrderId(0);
    setFulfillmentMode('available_now');
    setSelectedPaymentMethod('cash');
    clearSearchState();
    setPendingProductSelectionReview(false);
    setProductSearchMessage('');
    setEntryActionLocked(false);
    createBillConfirmationSignatureRef.current = '';
    setCreateBillConfirmationOpen(false);
    setClearBillConfirmationOpen(false);
    setError(null);
    focusEntryField('search');
  }, [
    billItems.length,
    clearBillConfirmationOpen,
    currentItem?.disc,
    currentItem?.name,
    currentItem?.price,
    currentItem?.qty,
    customer?.address,
    customer?.email,
    customer?.name,
    customer?.phone,
    clearSearchState,
    focusEntryField,
    paidAmount,
  ]);

  const handleCancelCreateBillConfirmation = useCallback(() => {
    createBillConfirmationSignatureRef.current = '';
    setCreateBillConfirmationOpen(false);
  }, []);

  const handleCancelClearBillConfirmation = useCallback(() => {
    setClearBillConfirmationOpen(false);
  }, []);

  const handleCustomerModalClose = useCallback(() => {
    setShowCustomerCreateModal(false);
    focusEntryField('search');
  }, [focusEntryField]);

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

export default BillingSystem;
