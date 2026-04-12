import { useCallback, useEffect, useRef, useState } from 'react';
import { createClientRequestId, purchaseOrdersApi, distributorsApi, suppliersApi, productsApi, purchaseReturnsApi, distributorLedgerApi } from '../api/index.js';
import { printHtmlDocument, escapeHtml } from '../../../../shared/utils/printService';
import { formatCurrency, formatDate } from '../../../../shared/utils/formatters';
import { getTodayDate, formatDateTime, toLocalDateKey } from '../../../../shared/utils/dateTime';
import { getLedgerTypeLabel, toNumber } from '../../../../shared/utils/ledger';
import useIsMobile from '../../../../shared/hooks/useIsMobile';
import usePopupDraftPersistence from '../../../../shared/hooks/usePopupDraftPersistence';
import {
  buildBackofficePopupPath,
  clearBackofficePopupHandoff,
  createBackofficePopupChannel,
  getBackofficePopupHandoffKey,
  openBackofficePopup,
  readBackofficePopupHandoff,
} from '../../../../shared/utils/backofficePopup';
import useOrderDetailComputed from './useOrderDetailComputed';
import usePurchaseCalculations from './usePurchaseCalculations';
import usePoModalSizing from './usePoModalSizing';
import usePurchaseDataFetch from './usePurchaseDataFetch';
import usePurchaseManagementState from './usePurchaseManagementState';
import usePurchaseManagementDerived from './usePurchaseManagementDerived';
import usePurchaseManagementHandlers from './usePurchaseManagementHandlers';
import {
  createDefaultLedgerFormData,
  createDefaultOrderFormData,
  createDefaultPoCorrectionFormData,
  createDefaultPoPaymentFormData,
  createDefaultProcessFormData,
} from '../utils/forms';
import {
  createEmptyOrderItem,
  findProductForItem,
} from '../utils/items';
import {
  fromBaseQtyForProduct,
  getAllowedPurchaseUnitsForProduct,
  getProductUomProfile,
  getPurchasePackStep,
  resolvePurchaseUnitForProduct,
  toBaseQtyForProduct,
} from '../utils/uom';
import {
  GST_RATE_OPTIONS,
  calculateOrderBalanceAmount,
  canAddPaymentToPo,
  canClosePo,
  canReceivePo,
  getOrderDisplayTotal,
  getPoBalanceDue,
  getPoLifecycleStatus,
  getPoNextAction,
  getPoPaidAmount,
  getPoPaymentStatus,
  getPurchaseRequestErrorMessage,
  isPoEditable,
  normalizeGstRateOption,
  normalizePoPaymentStatus,
} from '../utils/orders';
import {
  getLedgerRowStatusClass,
  getOrderDistributorInfo,
  getPoPaymentBadge,
  getStatusBadge,
} from '../components/PurchaseOrderPresentation.jsx';
import {
  getEntryDisplayBalance,
  getLedgerBalanceSummary,
  normalizeTextKey,
} from '../utils/ledgerHelpers';
import {
  getProductSearchLabel,
  getProductSearchOptionLabel,
  findActivePurchaseProduct,
  resolveProductByInput as resolveProductByInputHelper,
  getDistributorProductOptions as getDistributorProductOptionsHelper,
  getDistributorProductHistoryEntry as getDistributorProductHistoryEntryHelper,
  getLatestProductHistoryEntry as getLatestProductHistoryEntryHelper,
  getDistributorHistoryProducts as getDistributorHistoryProductsHelper,
} from '../utils/productSearch';
import { addLocalLedgerEntry } from '../utils/localLedgerStorage';
import createDefaultOperationsSummary from '../utils/operationsSummary';
import buildPurchaseManagementPageProps from '../utils/buildPurchaseManagementPageProps';
import {
  readSavedPurchaseDrafts,
  writeSavedPurchaseDrafts,
} from '../utils/savedDrafts';
import { applyPurchaseDraftLastPurchaseSuggestion } from '../utils/orderDrafts';

const LOCAL_LEDGER_KEY = 'purchase_distributor_ledger_local_entries';
const PO_MODAL_SIZE_KEY = 'po_entry_modal_size_v1';
const SUPPLIER_DEFAULT_ITEM_SOURCE = 'supplier_default';
const MANUAL_ADDED_ITEM_SOURCE = 'manual_added';

const hasMeaningfulPurchaseDraftItem = (item = {}) => (
  Number(item?.product_id || 0) > 0
  || String(item?.product_query || '').trim().length > 0
  || String(item?.product_name || '').trim().length > 0
  || Number(item?.quantity || 0) > 1
  || Number(item?.rate ?? item?.unit_price ?? 0) > 0
);

const usePurchaseManagementController = ({
  user,
  shortcutOpenOrderRequest = 0,
  shortcutOpenOrderPayload = null,
  onShortcutDraftClosed = null,
  onShortcutOpenOrderHandled = null,
  popupMode = false,
  showSectionTabs = true,
  autoOpenOrderForm = false,
  initialActiveSubTab = 'dashboard',
  draftStorageKey = '',
}) => {
  const isMobile = useIsMobile();
  const getDefaultOrderFormData = createDefaultOrderFormData;
  const getDefaultProcessFormData = createDefaultProcessFormData;
  const getDefaultPoPaymentFormData = createDefaultPoPaymentFormData;
  const getDefaultLedgerFormData = createDefaultLedgerFormData;
  const getDefaultPoCorrectionFormData = createDefaultPoCorrectionFormData;
  const restoredPopupDraftRef = useRef(false);
  const processedPopupHandoffIdRef = useRef('');
  const handledShortcutRequestRef = useRef(0);
  const shortcutDraftHadMeaningfulItemsRef = useRef(false);
  const [shortcutDraftContext, setShortcutDraftContext] = useState(null);

  const {
    activeSubTab, setActiveSubTab, purchaseOrders, setPurchaseOrders, purchaseReturns, setPurchaseReturns,
    distributors, setDistributors, suppliers, setSuppliers, products, setProducts, loading, setLoading, error, setError, success, setSuccess,
    orderSubmitting, setOrderSubmitting, orderReviewMode, setOrderReviewMode, lastSavedOrderSummary, setLastSavedOrderSummary, orderFormClientRequestId, setOrderFormClientRequestId, orderSubmitLockRef,
    filters, setFilters, showOrderForm, setShowOrderForm,
    showReceiveModal, setShowReceiveModal, receiveSubmitting, setReceiveSubmitting, showReturnForm, setShowReturnForm,
    returnSubmitting, setReturnSubmitting, showLedgerForm, setShowLedgerForm, ledgerSubmitting, setLedgerSubmitting,
    showPoCorrectionForm, setShowPoCorrectionForm, showProcessModal, setShowProcessModal, processSubmitting, setProcessSubmitting,
    sendingWhatsAppOrderId, setSendingWhatsAppOrderId, processingOrder, setProcessingOrder, processFormData, setProcessFormData,
    showPoPaymentModal, setShowPoPaymentModal, poPaymentSubmitting, setPoPaymentSubmitting, poPaymentLockRef,
    poPaymentClientRequestIdRef, ledgerSubmitLockRef, returnSubmitLockRef, poCorrectionLockRef, processSubmitLockRef,
    receiveSubmitLockRef, paymentOrder, setPaymentOrder, poPaymentFormData, setPoPaymentFormData, selectedOrder, setSelectedOrder,
    selectedCorrectionOrder, setSelectedCorrectionOrder, ledgerRecords, setLedgerRecords, ledgerLoading, setLedgerLoading,
    operationsLoading, setOperationsLoading, rollupParams, setRollupParams, operationsSummary, setOperationsSummary,
    ledgerFormData, setLedgerFormData, poCorrectionFormData, setPoCorrectionFormData, poCorrectionContext, setPoCorrectionContext,
    poCorrectionSubmitting, setPoCorrectionSubmitting, showOrderDetail, setShowOrderDetail, orderDetail, setOrderDetail,
    orderDetailLoading, setOrderDetailLoading, orderDetailEditMode, setOrderDetailEditMode, orderDetailSaving, setOrderDetailSaving,
    orderDetailDraft, setOrderDetailDraft, editingOrderId, setEditingOrderId, orderFullMode, setOrderFullMode,
    loadingDistributorItems, setLoadingDistributorItems, activePoProductField, setActivePoProductField,
    orderFormData, setOrderFormData, receiveData, setReceiveData, returnFormData, setReturnFormData,
  } = usePurchaseManagementState({
    initialActiveSubTab,
    getDefaultOrderFormData,
    getDefaultProcessFormData,
    getDefaultPoPaymentFormData,
    getDefaultLedgerFormData,
    getDefaultPoCorrectionFormData,
    createDefaultOperationsSummary,
    createClientRequestId,
  });
  const [savedOrderDrafts, setSavedOrderDrafts] = useState(() => readSavedPurchaseDrafts());
  const [activeSavedOrderDraftId, setActiveSavedOrderDraftId] = useState('');
  const activeSavedOrderDraftIdRef = useRef('');
  const draftSaveCountRef = useRef(0);
  const [restockPendingSelection, setRestockPendingSelection] = useState(null);
  const restockPendingApplyRef = useRef('');
  const {
    buildOrderDraftItem,
    calculateOrderItem,
    calculateOrderTotals,
  } = usePurchaseCalculations({
    products,
    toNumber,
    createEmptyOrderItem,
    resolvePurchaseUnitForProduct,
    getProductUomProfile,
    toBaseQtyForProduct,
    normalizeGstRateOption,
    findProductForItem,
  });

  useEffect(() => {
    activeSavedOrderDraftIdRef.current = String(activeSavedOrderDraftId || '').trim();
  }, [activeSavedOrderDraftId]);

  const {
    fetchOrders,
    fetchOperationsSummary,
    fetchReturns,
    fetchDistributorLedger,
  } = usePurchaseDataFetch({
    distributorsApi,
    suppliersApi,
    productsApi,
    purchaseOrdersApi,
    purchaseReturnsApi,
    distributorLedgerApi,
    filters,
    rollupParams,
    activeSubTab,
    purchaseOrders,
    localLedgerKey: LOCAL_LEDGER_KEY,
    setLoading,
    setError,
    setDistributors,
    setSuppliers,
    setProducts,
    setPurchaseOrders,
    setOperationsLoading,
    setOperationsSummary,
    setPurchaseReturns,
    setLedgerLoading,
    setLedgerRecords,
  });
  const {
    poModalSize,
    poModalRef,
  } = usePoModalSizing({
    isMobile,
    storageKey: PO_MODAL_SIZE_KEY,
    toNumber,
  });

  useEffect(() => {
    if (!success) return undefined;
    const timerId = window.setTimeout(() => setSuccess(''), 3200);
    return () => window.clearTimeout(timerId);
  }, [success]);

  const handleOpenBrowserWorkspace = useCallback(() => {
    const popupResult = openBackofficePopup('purchase');
    if (popupResult.status === 'blocked' && popupResult.path) {
      window.location.assign(popupResult.path);
      return;
    }
    if (popupResult.status === 'unsupported') {
      window.location.assign(buildBackofficePopupPath('purchase'));
    }
  }, []);

  const clearLastSavedOrderSummary = useCallback(() => {
    setLastSavedOrderSummary(null);
  }, [setLastSavedOrderSummary]);

  const patchSupplierVisitSummary = useCallback((supplierIdValue, dateValue, updates = {}) => {
    const supplierId = Number(supplierIdValue || 0) || null;
    const dateKey = toDateInputValue(dateValue || getTodayDate());
    if (!supplierId || !dateKey) return;
    setOperationsSummary((current) => {
      const baseSummary = current && typeof current === 'object'
        ? current
        : createDefaultOperationsSummary();
      const currentVisits = Array.isArray(baseSummary?.supplier_visits)
        ? baseSummary.supplier_visits
        : [];
      const nextVisits = [...currentVisits];
      const visitIndex = nextVisits.findIndex((entry) => (
        Number(entry?.supplier_id || 0) === supplierId
        && String(entry?.date || '').trim() === dateKey
      ));
      const existingVisit = visitIndex >= 0 ? nextVisits[visitIndex] : null;
      const nextVisit = {
        supplier_id: supplierId,
        date: dateKey,
        poDone: Boolean(existingVisit?.poDone),
        paymentDone: Boolean(existingVisit?.paymentDone),
        visitClosed: Boolean(existingVisit?.visitClosed),
        ...existingVisit,
        ...updates,
      };
      nextVisit.isHandled = Boolean(nextVisit.poDone || nextVisit.visitClosed);
      if (visitIndex >= 0) {
        nextVisits[visitIndex] = nextVisit;
      } else {
        nextVisits.push(nextVisit);
      }
      return {
        ...baseSummary,
        supplier_visits: nextVisits,
      };
    });
  }, [getTodayDate, setOperationsSummary]);

  const handleCloseSupplierVisit = useCallback(async ({ supplierId, date } = {}) => {
    const normalizedSupplierId = Number(supplierId || 0) || null;
    const visitDate = toDateInputValue(date || getTodayDate());
    if (!normalizedSupplierId || !visitDate) return false;
    setError('');
    patchSupplierVisitSummary(normalizedSupplierId, visitDate, { visitClosed: true });
    try {
      await purchaseOrdersApi.closeVisit({
        supplier_id: normalizedSupplierId,
        date: visitDate,
      });
      await fetchOperationsSummary();
      setSuccess('Supplier visit closed.');
      return true;
    } catch (err) {
      await fetchOperationsSummary();
      setError(getPurchaseRequestErrorMessage(err, 'Failed to close supplier visit'));
      return false;
    }
  }, [
    fetchOperationsSummary,
    getPurchaseRequestErrorMessage,
    getTodayDate,
    patchSupplierVisitSummary,
    setError,
    setSuccess,
  ]);

  const handleReopenSupplierVisit = useCallback(async ({ supplierId, date } = {}) => {
    const normalizedSupplierId = Number(supplierId || 0) || null;
    const visitDate = toDateInputValue(date || getTodayDate());
    if (!normalizedSupplierId || !visitDate) return false;
    setError('');
    patchSupplierVisitSummary(normalizedSupplierId, visitDate, { visitClosed: false });
    try {
      await purchaseOrdersApi.reopenVisit({
        supplier_id: normalizedSupplierId,
        date: visitDate,
      });
      await fetchOperationsSummary();
      setSuccess('Supplier visit reopened.');
      return true;
    } catch (err) {
      await fetchOperationsSummary();
      setError(getPurchaseRequestErrorMessage(err, 'Failed to reopen supplier visit'));
      return false;
    }
  }, [
    fetchOperationsSummary,
    getPurchaseRequestErrorMessage,
    getTodayDate,
    patchSupplierVisitSummary,
    setError,
    setSuccess,
  ]);

  const clearShortcutDraftContext = useCallback(() => {
    shortcutDraftHadMeaningfulItemsRef.current = false;
    setShortcutDraftContext(null);
  }, []);
  const persistSavedOrderDrafts = useCallback((nextValue) => {
    setSavedOrderDrafts((current) => {
      const nextDrafts = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      return writeSavedPurchaseDrafts(nextDrafts);
    });
  }, []);
  const handleOrderSaved = useCallback(() => {
    if (!activeSavedOrderDraftId) return;
    persistSavedOrderDrafts((current) => current.filter((entry) => entry.id !== activeSavedOrderDraftId));
    setActiveSavedOrderDraftId('');
  }, [activeSavedOrderDraftId, persistSavedOrderDrafts]);
  const [supplierRegisteredProductsBySupplier, setSupplierRegisteredProductsBySupplier] = useState({});
  const seededSupplierBoardKeyRef = useRef('');

  const loadSupplierRegisteredProducts = useCallback(async (supplierId, options = {}) => {
    const normalizedSupplierId = String(supplierId || '').trim();
    if (!normalizedSupplierId) return [];
    if (!options.force && Object.prototype.hasOwnProperty.call(supplierRegisteredProductsBySupplier, normalizedSupplierId)) {
      return supplierRegisteredProductsBySupplier[normalizedSupplierId] || [];
    }

    if (!options.silent) {
      setLoadingDistributorItems(true);
    }

    try {
      const response = await suppliersApi.getProducts(normalizedSupplierId);
      const nextProducts = Array.isArray(response) ? response : [];
      setSupplierRegisteredProductsBySupplier((prev) => ({
        ...prev,
        [normalizedSupplierId]: nextProducts,
      }));
      return nextProducts;
    } catch (error) {
      setSupplierRegisteredProductsBySupplier((prev) => (
        Object.prototype.hasOwnProperty.call(prev, normalizedSupplierId)
          ? prev
          : {
              ...prev,
              [normalizedSupplierId]: [],
            }
      ));
      if (!options.silent) {
        setError(error?.message || 'Failed to load supplier products');
      }
      return [];
    } finally {
      if (!options.silent) {
        setLoadingDistributorItems(false);
      }
    }
  }, [
    setError,
    setLoadingDistributorItems,
    supplierRegisteredProductsBySupplier,
  ]);
  const refreshSupplierRegisteredProducts = useCallback(async (supplierId) => {
    const normalizedSupplierId = String(supplierId || '').trim();
    if (!normalizedSupplierId) return [];
    return loadSupplierRegisteredProducts(normalizedSupplierId, {
      force: true,
      silent: true,
    });
  }, [loadSupplierRegisteredProducts]);

  const buildSupplierDefaultOrderItem = useCallback((registeredProduct = null, distributorId = '') => {
    const productId = String(registeredProduct?.product_id || registeredProduct?.id || '').trim();
    if (!productId) return null;

    const product = findActivePurchaseProduct(products, productId)
      || (registeredProduct?.is_active === false || Number(registeredProduct?.is_active ?? 1) === 0 ? null : registeredProduct)
      || null;
    const fallbackRate = Number(product?.price || registeredProduct?.price || 0) || 0;
    let nextItem = buildOrderDraftItem(product, {
      product_id: productId,
      product_name: registeredProduct?.name || registeredProduct?.product_name || product?.name || '',
      quantity: 0,
      uom: registeredProduct?.base_unit || registeredProduct?.uom || product?.base_unit || product?.uom || 'pcs',
      rate: fallbackRate,
      unit_price: fallbackRate,
      reference_rate: fallbackRate,
      reference_rate_source: fallbackRate > 0 ? 'product default rate' : '',
    });

    const supplierHistoryEntry = getDistributorProductHistoryEntryHelper({
      distributorId,
      productId,
      products,
      purchaseOrders,
    });
    const latestHistoryEntry = supplierHistoryEntry?.item
      ? supplierHistoryEntry
      : getLatestProductHistoryEntryHelper({
          productId,
          products,
          purchaseOrders,
        });

    if (latestHistoryEntry?.item) {
      nextItem = applyPurchaseDraftLastPurchaseSuggestion({
        item: nextItem,
        product,
        suggestion: {
          found: true,
          rate: latestHistoryEntry.item?.rate,
          unit_price: latestHistoryEntry.item?.unit_price,
          gst_rate: latestHistoryEntry.item?.gst_rate,
          uom: latestHistoryEntry.item?.uom,
          created_at: latestHistoryEntry.order?.created_at
            || latestHistoryEntry.order?.order_date
            || latestHistoryEntry.order?.expected_delivery
            || '',
          po_number: latestHistoryEntry.order?.po_number || '',
          distributor_name: latestHistoryEntry.order?.distributor_name || '',
        },
        suggestedQuantity: latestHistoryEntry.item?.quantity,
        preserveQuantity: false,
        resolvePurchaseUnitForProduct,
        normalizeGstRateOption,
        toNumber,
      });
    } else {
      const registryRate = Number(registeredProduct?.last_known_unit_cost_incl_tax || 0) || 0;
      if (registryRate > 0) {
        nextItem = {
          ...nextItem,
          unit_price: registryRate,
          rate: registryRate,
          reference_rate: registryRate,
          reference_rate_source: 'supplier product list',
        };
      }
    }

    return {
      ...nextItem,
      row_source: 'supplier',
      quantity: 0,
      po_item_source: SUPPLIER_DEFAULT_ITEM_SOURCE,
      po_item_locked: true,
    };
  }, [
    buildOrderDraftItem,
    normalizeGstRateOption,
    products,
    purchaseOrders,
    resolvePurchaseUnitForProduct,
    toNumber,
  ]);

  const buildSupplierBoardItems = useCallback(({
    distributorId = '',
    currentItems = [],
    registeredProducts = [],
  }) => {
    const normalizedDistributorId = String(distributorId || '').trim();
    if (!normalizedDistributorId) {
      return Array.isArray(currentItems) ? currentItems : [];
    }

    const nextItems = [];
    const existingItemByProductId = new Map();
    const normalizedCurrentItems = Array.isArray(currentItems) ? currentItems : [];
    normalizedCurrentItems.forEach((item) => {
      const productId = String(item?.product_id || '').trim();
      if (!productId || existingItemByProductId.has(productId)) return;
      existingItemByProductId.set(productId, item);
    });

    const supplierProductIds = new Set();
    (Array.isArray(registeredProducts) ? registeredProducts : []).forEach((registeredProduct) => {
      if (registeredProduct?.is_active === false || Number(registeredProduct?.is_active ?? 1) === 0) return;
      const productId = String(registeredProduct?.product_id || registeredProduct?.id || '').trim();
      if (!productId || supplierProductIds.has(productId)) return;
      supplierProductIds.add(productId);

      const existingItem = existingItemByProductId.get(productId);
      if (existingItem) {
        nextItems.push({
          ...existingItem,
          row_source: 'supplier',
          po_item_source: SUPPLIER_DEFAULT_ITEM_SOURCE,
          po_item_locked: true,
        });
        return;
      }

      const seededItem = buildSupplierDefaultOrderItem(registeredProduct, normalizedDistributorId);
      if (seededItem) {
        nextItems.push(seededItem);
      }
    });

    normalizedCurrentItems.forEach((item) => {
      const productId = String(item?.product_id || '').trim();
      if (productId) {
        if (supplierProductIds.has(productId)) return;
        nextItems.push({
          ...item,
          row_source: 'manual',
          po_item_source: MANUAL_ADDED_ITEM_SOURCE,
          po_item_locked: false,
        });
        return;
      }

      if (hasMeaningfulPurchaseDraftItem(item)) {
        nextItems.push({
          ...item,
          row_source: 'manual',
          po_item_source: MANUAL_ADDED_ITEM_SOURCE,
          po_item_locked: false,
        });
      }
    });

    return nextItems;
  }, [buildSupplierDefaultOrderItem]);
  const selectedOrderDistributorId = String(orderFormData?.distributor_id || '').trim();
  const selectedOrderSupplierId = String(orderFormData?.supplier_id || '').trim();
  const selectedSupplierRegisteredProducts = selectedOrderSupplierId
    ? (supplierRegisteredProductsBySupplier[selectedOrderSupplierId] || [])
    : [];
  const hasLoadedSelectedSupplierRegisteredProducts = selectedOrderSupplierId
    ? Object.prototype.hasOwnProperty.call(supplierRegisteredProductsBySupplier, selectedOrderSupplierId)
    : false;

  const {
    getDistributorProductOptions,
    getDistributorHistoryProducts,
    handleDistributorInputChange,
    handleOrderItemAdd,
    handleOrderItemRemove,
    handleOrderProductFieldFocus,
    handleLoadDistributorItems,
    handleApplySupplierHistoryItem,
    handleFilterChange,
    openCreateOrderForm: openCreateOrderFormInternal,
    openCreateOrderFormForDistributor: openCreateOrderFormForDistributorInternal,
    closeOrderForm: closeOrderFormInternal,
    handlePurchaseSectionChange,
    handleOpenOrderReview,
    handleOrderSubmit,
    handleEditOrder,
    handleOrderItemChange,
    handleOrderProductInputChange,
    handleApplyCatalogProducts,
    handleUpdateStatus,
    handleSendDistributorWhatsApp,
    handleDeleteOrder,
    handleReceiveClick,
    handleReceiveItemChange,
    handleReceiveQtyStep,
    handleReceiveSubmit,
    handleOpenProcessModal,
    closeProcessModal,
    handleProcessSubmit,
    handleOpenPoPaymentModal,
    handleOpenPoPaymentById,
    closePoPaymentModal,
    handlePoPaymentSubmit,
    closeOrderDetail,
    handleOrderDetailFieldChange,
    handleOrderDetailItemChange,
    handleOrderDetailProductInputChange,
    handleOrderDetailItemAdd,
    handleOrderDetailItemRemove,
    openOrderDetailEditMode,
    handleOrderDetailSave,
    handleViewOrder,
    handleReturnFormOpen,
    closeReturnForm,
    handleReturnItemAdd,
    handleReturnItemChange,
    handleReturnItemRemove,
    handleReturnSubmit,
    closePoCorrectionForm,
    handleOpenPoCorrectionForm,
    handlePoCorrectionSubmit,
    handleOpenLedgerForm,
    closeLedgerForm,
    handleLedgerSubmit,
    handlePrintOrderDetail,
    getItemFinancials,
  } = usePurchaseManagementHandlers({
    distributors,
    suppliers,
    products,
    purchaseOrders,
    orderFormData,
    setOrderFormData,
    setError,
    setSuccess,
    setLoadingDistributorItems,
    buildOrderDraftItem,
    resolveProductByInputHelper,
    getDistributorProductOptionsHelper,
    getDistributorProductHistoryEntryHelper,
    getLatestProductHistoryEntryHelper,
    getDistributorHistoryProductsHelper,
    createEmptyOrderItem,
    activePoProductField,
    setActivePoProductField,
    setFilters,
    setActiveSubTab,
    getDefaultOrderFormData,
    setEditingOrderId,
    setOrderFullMode,
    setOrderReviewMode,
    setLastSavedOrderSummary,
    setOrderSubmitting,
    setShowOrderForm,
    orderSubmitLockRef,
    orderSubmitting,
    toNumber,
    calculateOrderItem,
    calculateOrderTotals,
    purchaseOrdersApi,
    user,
    editingOrderId,
    orderFormClientRequestId,
    setOrderFormClientRequestId,
    createClientRequestId,
    getPurchaseRequestErrorMessage,
    fetchOrders,
    fetchOperationsSummary,
    isPoEditable,
    toDateInputValue,
    productsApi,
    getProductSearchLabel,
    resolvePurchaseUnitForProduct,
    normalizeGstRateOption,
    findProductForItem,
    fetchDistributorLedger,
    setSendingWhatsAppOrderId,
    receiveData,
    setReceiveData,
    selectedOrder,
    setSelectedOrder,
    setShowReceiveModal,
    setReceiveSubmitting,
    receiveSubmitLockRef,
    getDefaultProcessFormData,
    setProcessingOrder,
    setProcessFormData,
    setShowProcessModal,
    setProcessSubmitting,
    processSubmitLockRef,
    getTodayDate,
    getOrderDisplayTotal,
    processingOrder,
    processFormData,
    getPoBalanceDue,
    getDefaultPoPaymentFormData,
    setPoPaymentFormData,
    setPaymentOrder,
    setShowPoPaymentModal,
    setPoPaymentSubmitting,
    poPaymentSubmitting,
    poPaymentLockRef,
    poPaymentClientRequestIdRef,
    paymentOrder,
    poPaymentFormData,
    orderDetail,
    orderDetailDraft,
    setOrderDetail,
    setOrderDetailDraft,
    setShowOrderDetail,
    setOrderDetailLoading,
    setOrderDetailEditMode,
    setOrderDetailSaving,
    returnFormData,
    setReturnFormData,
    setShowReturnForm,
    setReturnSubmitting,
    returnSubmitLockRef,
    purchaseReturnsApi,
    fetchReturns,
    distributorLedgerApi,
    calculateOrderBalanceAmount,
    normalizeTextKey,
    getDefaultPoCorrectionFormData,
    getDefaultLedgerFormData,
    setShowPoCorrectionForm,
    setSelectedCorrectionOrder,
    setPoCorrectionFormData,
    setPoCorrectionContext,
    setPoCorrectionSubmitting,
    poCorrectionLockRef,
    selectedCorrectionOrder,
    poCorrectionSubmitting,
    poCorrectionFormData,
    setShowLedgerForm,
    setLedgerFormData,
    setLedgerSubmitting,
    ledgerSubmitLockRef,
    ledgerSubmitting,
    ledgerFormData,
    addLocalLedgerEntry,
    localLedgerKey: LOCAL_LEDGER_KEY,
    filters,
    getOrderDistributorInfo,
    getProductUomProfile,
    toBaseQtyForProduct,
    getPoLifecycleStatus,
    getPoPaymentStatus,
    getPoPaidAmount,
    formatDate,
    formatCurrency,
    escapeHtml,
    printHtmlDocument,
    onOrderSaved: handleOrderSaved,
    refreshSupplierRegisteredProducts,
  });

  const handleShortcutDraftClosed = useCallback((reason = 'cancel') => {
    const activeContext = shortcutDraftContext;
    clearShortcutDraftContext();
    if (activeContext?.source !== 'restock' || typeof onShortcutDraftClosed !== 'function') {
      return;
    }
    onShortcutDraftClosed({
      source: 'restock',
      reason,
      returnTab: String(activeContext?.returnTab || 'restock-dashboard').trim() || 'restock-dashboard',
    });
  }, [clearShortcutDraftContext, onShortcutDraftClosed, shortcutDraftContext]);

  const openCreateOrderForm = useCallback((options = {}, context = null) => {
    shortcutDraftHadMeaningfulItemsRef.current = false;
    setShortcutDraftContext(context && typeof context === 'object' ? context : null);
    setActiveSavedOrderDraftId('');
    activeSavedOrderDraftIdRef.current = '';
    draftSaveCountRef.current = 0;
    openCreateOrderFormInternal(options);
  }, [openCreateOrderFormInternal]);

  const openCreateOrderFormForDistributor = useCallback((distributorId, options = {}, context = null) => {
    shortcutDraftHadMeaningfulItemsRef.current = false;
    setShortcutDraftContext(context && typeof context === 'object' ? context : null);
    setActiveSavedOrderDraftId('');
    activeSavedOrderDraftIdRef.current = '';
    draftSaveCountRef.current = 0;
    openCreateOrderFormForDistributorInternal(distributorId, options);
  }, [openCreateOrderFormForDistributorInternal]);

  const closeOrderForm = useCallback(() => {
    const isRestockShortcutDraft = shortcutDraftContext?.source === 'restock';
    closeOrderFormInternal();
    setActiveSavedOrderDraftId('');
    activeSavedOrderDraftIdRef.current = '';
    draftSaveCountRef.current = 0;
    if (isRestockShortcutDraft) {
      handleShortcutDraftClosed('cancel');
      return;
    }
    clearShortcutDraftContext();
  }, [
    clearShortcutDraftContext,
    closeOrderFormInternal,
    handleShortcutDraftClosed,
    shortcutDraftContext?.source,
  ]);

  const getShortcutAction = useCallback((payload = null) => {
    const action = String(payload?.action || 'create-draft').trim().toLowerCase();
    if (action === 'open-payment') return 'open-payment';
    if (action === 'open-order') return 'open-order';
    return 'create-draft';
  }, []);

  const buildShortcutContext = useCallback((payload = null, extra = {}) => {
    if (payload?.source !== 'restock') return null;
    return {
      source: 'restock',
      returnTab: String(payload?.returnTab || 'restock-dashboard').trim() || 'restock-dashboard',
      autoCloseOnEmpty: payload?.autoCloseOnEmpty !== false,
      ...extra,
    };
  }, []);

  const applyShortcutPayload = useCallback((payload = null, shortcutContext = null) => {
    const action = getShortcutAction(payload);
    const isRestockShortcut = payload?.source === 'restock';
    const suggestedItems = Array.isArray(payload?.suggestedItems) ? payload.suggestedItems : [];
    if (action === 'open-payment') {
      const orderId = Number(payload?.orderId || payload?.purchaseOrderId || 0);
      if (orderId <= 0) {
        return {
          action,
          opened: false,
          message: 'Supplier payment shortcut is missing a purchase order.',
        };
      }
      setActiveSubTab('orders');
      handleOpenPoPaymentModal({ id: orderId });
      return { action, opened: true };
    }

    if (action === 'open-order') {
      const orderId = Number(payload?.orderId || payload?.purchaseOrderId || 0);
      if (orderId <= 0) {
        return {
          action,
          opened: false,
          message: 'Purchase review shortcut is missing a purchase order.',
        };
      }
      setActiveSubTab('orders');
      void handleViewOrder(orderId);
      return { action, opened: true };
    }

    setActiveSubTab('orders');
    if (payload?.distributorId) {
      openCreateOrderFormForDistributor(payload.distributorId, {
        distributor_name: payload.distributorName || '',
        supplier_id: payload.supplierId || '',
        supplier_name: payload.supplierName || '',
        planned_order_date: payload.plannedOrderDate || '',
        expected_delivery: payload.expectedDelivery || '',
        notes: payload.notes || '',
        suggested_items: suggestedItems,
      }, shortcutContext);
      return { action, opened: true };
    }

    if (isRestockShortcut && suggestedItems.length > 0) {
      restockPendingApplyRef.current = '';
      setRestockPendingSelection({
        key: `restock-${Date.now()}`,
        items: suggestedItems,
      });
    }

    openCreateOrderForm({
      planned_order_date: payload?.plannedOrderDate || '',
      expected_delivery: payload?.expectedDelivery || '',
      notes: payload?.notes || '',
      suggested_items: isRestockShortcut ? [] : suggestedItems,
    }, shortcutContext);
    return { action, opened: true };
  }, [
    getShortcutAction,
    handleOpenPoPaymentModal,
    handleViewOrder,
    openCreateOrderForm,
    openCreateOrderFormForDistributor,
    setActiveSubTab,
    setRestockPendingSelection,
  ]);

  const defaultOrderFormData = getDefaultOrderFormData();
  const normalizeRestoredOrderForm = useCallback((value) => {
    const restoredOrderForm = value && typeof value === 'object' ? value : {};
    const plannedOrderDate = String(restoredOrderForm?.planned_order_date || '').trim()
      || getTodayDate();
    return {
      ...restoredOrderForm,
      planned_order_date: plannedOrderDate,
    };
  }, [getTodayDate]);
  const hasMeaningfulOrderItems = Array.isArray(orderFormData?.items)
    && orderFormData.items.some((item) => (
      Number(item?.product_id || item?.productId || 0) > 0
      || String(item?.product_query || item?.name || '').trim().length > 0
      || Number(item?.quantity || 0) > 1
      || Number(item?.rate || item?.unit_price || 0) > 0
    ));
  const hasOpenDirtyOrderDraft = Boolean(
    showOrderForm
    && (
      editingOrderId
      || String(orderFormData?.supplier_id || '').trim()
      || String(orderFormData?.supplier_name || '').trim()
      || String(orderFormData?.distributor_id || '').trim()
      || String(orderFormData?.distributor_name || '').trim()
      || String(orderFormData?.strict_due_date || '').trim()
      || String(orderFormData?.strict_due_note || '').trim()
      || String(orderFormData?.notes || '').trim()
      || String(orderFormData?.planned_order_date || '').trim() !== String(defaultOrderFormData.planned_order_date || '').trim()
      || String(orderFormData?.expected_delivery || '').trim() !== String(defaultOrderFormData.expected_delivery || '').trim()
      || hasMeaningfulOrderItems
    )
  );

  useEffect(() => {
    if (showOrderForm) return;
    shortcutDraftHadMeaningfulItemsRef.current = false;
    setShortcutDraftContext(null);
    setActiveSavedOrderDraftId('');
    setRestockPendingSelection(null);
    restockPendingApplyRef.current = '';
  }, [setRestockPendingSelection, showOrderForm]);

  useEffect(() => {
    if (!showOrderForm) return;
    const distributorId = String(orderFormData?.distributor_id || '').trim();
    const distributorName = String(orderFormData?.distributor_name || '').trim();
    if (!distributorId || distributorName) return;
    const matchedDistributor = distributors.find((entry) => String(entry?.id || '') === distributorId);
    const matchedName = String(matchedDistributor?.name || '').trim();
    if (!matchedName) return;
    setOrderFormData((prev) => {
      if (String(prev?.distributor_id || '').trim() !== distributorId) return prev;
      if (String(prev?.distributor_name || '').trim()) return prev;
      return {
        ...prev,
        distributor_name: matchedName,
      };
    });
  }, [
    distributors,
    orderFormData?.distributor_id,
    orderFormData?.distributor_name,
    setOrderFormData,
    showOrderForm,
  ]);

  useEffect(() => {
    if (!showOrderForm) return;
    const distributorId = String(orderFormData?.distributor_id || '').trim();
    const distributorName = String(orderFormData?.distributor_name || '').trim();
    if (distributorId || !distributorName) return;
    const normalizedName = distributorName.toLowerCase().replace(/\s+/g, ' ').trim();
    const normalizeDistributorName = (value) => String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    const isActiveDistributor = (entry) => {
      const status = String(entry?.status || '').trim().toLowerCase();
      return !status || status === 'active';
    };
    const exactMatch = distributors.find((entry) => (
      isActiveDistributor(entry)
      && normalizeDistributorName(entry?.name) === normalizedName
    ));
    const startsWithMatches = distributors.filter((entry) => (
      isActiveDistributor(entry)
      && normalizeDistributorName(entry?.name).startsWith(normalizedName)
    ));
    const containsMatches = distributors.filter((entry) => (
      isActiveDistributor(entry)
      && normalizeDistributorName(entry?.name).includes(normalizedName)
    ));
    const matchedDistributor = exactMatch
      || (startsWithMatches.length === 1 ? startsWithMatches[0] : null)
      || (containsMatches.length === 1 ? containsMatches[0] : null);
    if (!matchedDistributor) return;
    setOrderFormData((prev) => {
      if (!prev || String(prev?.distributor_name || '').trim().toLowerCase() !== normalizedName) {
        return prev;
      }
      if (String(prev?.distributor_id || '').trim()) {
        return prev;
      }
      return {
        ...prev,
        distributor_id: String(matchedDistributor.id),
      };
    });
  }, [
    distributors,
    orderFormData?.distributor_id,
    orderFormData?.distributor_name,
    setOrderFormData,
    showOrderForm,
  ]);

  useEffect(() => {
    if (!showOrderForm) return;
    const supplierId = String(orderFormData?.supplier_id || '').trim();
    if (!supplierId) return;
    const supplier = (Array.isArray(suppliers) ? suppliers : []).find(
      (entry) => String(entry?.id || '') === supplierId && entry?.is_active !== false
    );
    if (!supplier) return;
    const supplierDistributorId = String(supplier?.distributor_id || '').trim();
    setOrderFormData((prev) => {
      if (String(prev?.supplier_id || '').trim() !== supplierId) return prev;
      const next = { ...prev };
      let updated = false;
      if (!String(prev?.supplier_name || '').trim()) {
        next.supplier_name = supplier?.name || '';
        updated = true;
      }
      if (supplierDistributorId && String(prev?.distributor_id || '').trim() !== supplierDistributorId) {
        next.distributor_id = supplierDistributorId;
        updated = true;
      }
      if (supplierDistributorId && !String(prev?.distributor_name || '').trim()) {
        const matchedDistributor = (Array.isArray(distributors) ? distributors : []).find(
          (entry) => String(entry?.id || '') === supplierDistributorId
        );
        if (matchedDistributor?.name) {
          next.distributor_name = matchedDistributor.name;
          updated = true;
        }
      }
      return updated ? next : prev;
    });
  }, [
    distributors,
    orderFormData?.distributor_id,
    orderFormData?.distributor_name,
    orderFormData?.supplier_id,
    orderFormData?.supplier_name,
    setOrderFormData,
    showOrderForm,
    suppliers,
  ]);

  useEffect(() => {
    if (!showOrderForm || editingOrderId) {
      seededSupplierBoardKeyRef.current = '';
      return;
    }
    if (!selectedOrderSupplierId) {
      seededSupplierBoardKeyRef.current = '';
      return;
    }
    if (hasLoadedSelectedSupplierRegisteredProducts) {
      return;
    }
    void loadSupplierRegisteredProducts(selectedOrderSupplierId);
  }, [
    editingOrderId,
    hasLoadedSelectedSupplierRegisteredProducts,
    loadSupplierRegisteredProducts,
    selectedOrderSupplierId,
    showOrderForm,
  ]);

  useEffect(() => {
    if (!showOrderForm || editingOrderId || !selectedOrderSupplierId) {
      return;
    }
    if (!hasLoadedSelectedSupplierRegisteredProducts) {
      return;
    }

    const registeredIds = selectedSupplierRegisteredProducts
      .map((entry) => String(entry?.product_id || entry?.id || '').trim())
      .filter(Boolean)
      .join(',');
    const nextSeedKey = `${selectedOrderSupplierId}:${registeredIds}`;
    if (seededSupplierBoardKeyRef.current === nextSeedKey) {
      return;
    }

    setOrderFormData((prev) => {
      if (String(prev?.supplier_id || '').trim() !== selectedOrderSupplierId) {
        return prev;
      }
      return {
        ...prev,
        items: buildSupplierBoardItems({
          distributorId: selectedOrderDistributorId,
          currentItems: prev.items,
          registeredProducts: selectedSupplierRegisteredProducts,
        }),
      };
    });
    seededSupplierBoardKeyRef.current = nextSeedKey;
  }, [
    buildSupplierBoardItems,
    editingOrderId,
    hasLoadedSelectedSupplierRegisteredProducts,
    selectedOrderDistributorId,
    selectedOrderSupplierId,
    selectedSupplierRegisteredProducts,
    setOrderFormData,
    showOrderForm,
  ]);

  useEffect(() => {
    if (!showOrderForm || editingOrderId || orderReviewMode) return;
    if (!restockPendingSelection?.items?.length) return;
    if (!selectedOrderSupplierId || !hasLoadedSelectedSupplierRegisteredProducts) return;

    const pendingKey = String(restockPendingSelection.key || '');
    if (pendingKey && restockPendingApplyRef.current === pendingKey) return;

    setOrderFormData((prev) => {
      if (String(prev?.supplier_id || '').trim() !== selectedOrderSupplierId) {
        return prev;
      }
      const currentItems = Array.isArray(prev?.items) ? prev.items : [];
      const nextItems = [...currentItems];
      const itemIndexByProductId = new Map();
      nextItems.forEach((item, index) => {
        const productId = String(item?.product_id || '').trim();
        if (!productId || itemIndexByProductId.has(productId)) return;
        itemIndexByProductId.set(productId, index);
      });

      restockPendingSelection.items.forEach((row) => {
        const productId = String(row?.product_id || row?.productId || '').trim();
        if (!productId) return;
        const quantity = Math.max(1, toNumber(row?.quantity || 0) || 0);
        const uom = String(row?.uom || row?.unit || '').trim();
        const existingIndex = itemIndexByProductId.get(productId);
        if (typeof existingIndex === 'number') {
          const existingItem = nextItems[existingIndex] || {};
          nextItems[existingIndex] = {
            ...existingItem,
            quantity,
            uom: uom || existingItem.uom,
          };
          return;
        }

        const productSnapshot = row?.product_snapshot || null;
        const product = findActivePurchaseProduct(products, productId)
          || (
            productSnapshot
            && productSnapshot.is_active !== false
            && Number(productSnapshot?.is_active ?? 1) !== 0
              ? productSnapshot
              : null
          );
        if (!product) return;
        const fallbackRate = Number(
          row?.rate
          ?? row?.unit_price
          ?? productSnapshot?.price
          ?? product?.price
          ?? 0
        ) || 0;
        const nextItem = buildOrderDraftItem(product, {
          product_id: productId,
          product_name: row?.product_name || productSnapshot?.name || product?.name || '',
          quantity,
          uom: uom || productSnapshot?.base_unit || product?.base_unit || product?.uom || 'pcs',
          rate: fallbackRate,
          unit_price: fallbackRate,
          reference_rate: fallbackRate,
          reference_rate_source: fallbackRate > 0 ? 'restock selection' : '',
        });
        nextItems.push({
          ...nextItem,
          row_source: 'manual',
          po_item_source: MANUAL_ADDED_ITEM_SOURCE,
          po_item_locked: false,
        });
      });

      return {
        ...prev,
        items: nextItems,
      };
    });

    restockPendingApplyRef.current = pendingKey;
    setRestockPendingSelection(null);
  }, [
    buildOrderDraftItem,
    editingOrderId,
    hasLoadedSelectedSupplierRegisteredProducts,
    orderReviewMode,
    products,
    restockPendingSelection,
    selectedOrderDistributorId,
    selectedOrderSupplierId,
    setOrderFormData,
    showOrderForm,
    toNumber,
  ]);

  useEffect(() => {
    if (!showOrderForm || editingOrderId || shortcutDraftContext?.source !== 'restock' || orderReviewMode) {
      shortcutDraftHadMeaningfulItemsRef.current = false;
      return;
    }
    if (hasMeaningfulOrderItems) {
      shortcutDraftHadMeaningfulItemsRef.current = true;
      return;
    }
    if (!shortcutDraftContext?.autoCloseOnEmpty || !shortcutDraftHadMeaningfulItemsRef.current) {
      return;
    }
    closeOrderFormInternal();
    handleShortcutDraftClosed('empty');
  }, [
    closeOrderFormInternal,
    editingOrderId,
    handleShortcutDraftClosed,
    hasMeaningfulOrderItems,
    orderReviewMode,
    showOrderForm,
    shortcutDraftContext,
  ]);

  useEffect(() => {
    if (!orderReviewMode) return;
    if (!showOrderForm) {
      setShowOrderForm(true);
    }
  }, [orderReviewMode, setShowOrderForm, showOrderForm]);

  useEffect(() => {
    if (!popupMode) return undefined;

    const consumePopupHandoff = () => {
      const handoff = readBackofficePopupHandoff('purchase');
      if (!handoff?.id || !handoff?.payload || processedPopupHandoffIdRef.current === handoff.id) {
        return;
      }
      processedPopupHandoffIdRef.current = handoff.id;

      const payload = handoff.payload;
      const shortcutAction = getShortcutAction(payload);
      const itemCount = Array.isArray(payload?.suggestedItems) ? payload.suggestedItems.length : 0;
      const popupShortcutContext = buildShortcutContext(payload, { handoffId: handoff.id });

      if (shortcutAction === 'create-draft' && hasOpenDirtyOrderDraft) {
        const shouldDiscardDraft = window.confirm(
          payload?.source === 'restock'
            ? 'A purchase order draft is already open.\n\nOpen the restock draft and discard the current draft?'
            : 'A purchase order draft is already open.\n\nOpen a new PO and discard the current draft?'
        );
        clearBackofficePopupHandoff('purchase', handoff.id);
        if (!shouldDiscardDraft) {
          if (payload?.source === 'restock') {
            setSuccess(itemCount > 0
              ? `Restock selection kept. Retry later for ${itemCount} item${itemCount === 1 ? '' : 's'}.`
              : 'Restock selection kept. Retry later.');
          } else {
            setSuccess('Current purchase draft kept.');
          }
          return;
        }
      }

      const shortcutResult = applyShortcutPayload(payload, popupShortcutContext);
      clearBackofficePopupHandoff('purchase', handoff.id);
      if (!shortcutResult.opened) {
        setError(shortcutResult.message || 'Failed to open the purchase shortcut.');
        return;
      }
      if (shortcutResult.action === 'open-payment') {
        setSuccess('Supplier payment opened in popup.');
        return;
      }
      if (shortcutResult.action === 'open-order') {
        setSuccess('Purchase order review opened in popup.');
        return;
      }
      setSuccess(itemCount > 0
        ? `PO popup opened with ${itemCount} item${itemCount === 1 ? '' : 's'}.`
        : 'PO popup opened.');
    };

    const handleStorage = (event) => {
      if (event.key && event.key !== getBackofficePopupHandoffKey('purchase')) return;
      consumePopupHandoff();
    };

    const channel = createBackofficePopupChannel();
    const handleChannelMessage = (event) => {
      const kind = String(event?.data?.kind || '').trim().toLowerCase();
      if (kind !== 'purchase') return;
      if (event?.data?.type === 'popup-handoff') {
        consumePopupHandoff();
        return;
      }
      if (event?.data?.type !== 'popup-handoff-cleared') return;
      if (shortcutDraftContext?.source !== 'restock' || !showOrderForm || orderReviewMode) return;
      closeOrderFormInternal();
      clearShortcutDraftContext();
      setSuccess('Restock selection cleared. Purchase draft closed.');
    };

    window.addEventListener('storage', handleStorage);
    channel?.addEventListener('message', handleChannelMessage);
    consumePopupHandoff();

    return () => {
      window.removeEventListener('storage', handleStorage);
      channel?.removeEventListener('message', handleChannelMessage);
      channel?.close();
    };
  }, [
    applyShortcutPayload,
    buildShortcutContext,
    clearShortcutDraftContext,
    closeOrderFormInternal,
    hasOpenDirtyOrderDraft,
    getShortcutAction,
    orderReviewMode,
    popupMode,
    setError,
    setSuccess,
    shortcutDraftContext?.source,
    showOrderForm,
  ]);

  useEffect(() => {
    if (!shortcutOpenOrderRequest) return;
    if (handledShortcutRequestRef.current === shortcutOpenOrderRequest) return;
    handledShortcutRequestRef.current = shortcutOpenOrderRequest;
    const shortcutPayload = shortcutOpenOrderPayload && typeof shortcutOpenOrderPayload === 'object'
      ? shortcutOpenOrderPayload
      : null;
    const shortcutAction = getShortcutAction(shortcutPayload);
    const shortcutContext = buildShortcutContext(shortcutPayload);
    if (shortcutAction === 'create-draft' && hasOpenDirtyOrderDraft) {
      if (shortcutContext?.source === 'restock') {
        closeOrderFormInternal();
        clearShortcutDraftContext();
        shortcutDraftHadMeaningfulItemsRef.current = false;
      } else {
        const shouldDiscardDraft = window.confirm(
          'A purchase order draft is already open.\n\nOpen a new PO and discard the current draft?'
        );
        if (!shouldDiscardDraft) {
          if (shortcutContext?.source === 'restock') {
            handleShortcutDraftClosed('deferred');
          }
          if (typeof onShortcutOpenOrderHandled === 'function') {
            onShortcutOpenOrderHandled();
          }
          return;
        }
      }
    }
    const shortcutResult = applyShortcutPayload(shortcutPayload, shortcutContext);
    if (!shortcutResult.opened) {
      setError(shortcutResult.message || 'Failed to open the purchase shortcut.');
    }
    if (typeof onShortcutOpenOrderHandled === 'function') {
      onShortcutOpenOrderHandled();
    }
  }, [
    applyShortcutPayload,
    buildShortcutContext,
    getShortcutAction,
    handleShortcutDraftClosed,
    hasOpenDirtyOrderDraft,
    onShortcutOpenOrderHandled,
    setError,
    shortcutOpenOrderPayload,
    shortcutOpenOrderRequest,
  ]);

  const orderDraftPersistable = Boolean(
    popupMode
    && showOrderForm
    && !editingOrderId
    && (
      String(orderFormData?.supplier_id || '').trim()
      || String(orderFormData?.supplier_name || '').trim()
      || String(orderFormData?.distributor_id || '').trim()
      || String(orderFormData?.distributor_name || '').trim()
      || String(orderFormData?.strict_due_date || '').trim()
      || String(orderFormData?.strict_due_note || '').trim()
      || String(orderFormData?.notes || '').trim()
      || String(orderFormData?.planned_order_date || '').trim() !== String(defaultOrderFormData.planned_order_date || '').trim()
      || String(orderFormData?.expected_delivery || '').trim() !== String(defaultOrderFormData.expected_delivery || '').trim()
      || hasMeaningfulOrderItems
    )
  );

  usePopupDraftPersistence({
    kind: 'purchase',
    storageKey: draftStorageKey,
    enabled: popupMode,
    isDirty: orderDraftPersistable,
    draft: {
      activeSubTab: 'orders',
      orderFullMode,
      orderReviewMode,
      orderFormData,
      showOrderForm,
    },
    onRestore: (draft) => {
      const restoredOrderForm = draft?.orderFormData && typeof draft.orderFormData === 'object'
        ? normalizeRestoredOrderForm(draft.orderFormData)
        : null;
      if (!restoredOrderForm) return;
      restoredPopupDraftRef.current = true;
      orderSubmitLockRef.current = false;
      setActiveSubTab('orders');
      setEditingOrderId(null);
      setOrderFullMode(Boolean(draft?.orderFullMode));
      setOrderReviewMode(Boolean(draft?.orderReviewMode));
      setActiveSavedOrderDraftId('');
      setOrderSubmitting(false);
      setLoadingDistributorItems(false);
      setActivePoProductField({ mode: 'entry', index: 0 });
      setOrderFormData({
        ...getDefaultOrderFormData(),
        ...restoredOrderForm,
        items: Array.isArray(restoredOrderForm.items) && restoredOrderForm.items.length
          ? restoredOrderForm.items
          : [createEmptyOrderItem()],
      });
      setShowOrderForm(Boolean(draft?.showOrderForm ?? true));
      setError('');
      setSuccess('Restored unsaved purchase draft.');
    },
  });

  useEffect(() => {
    if (!popupMode || !autoOpenOrderForm) return;
    if (restoredPopupDraftRef.current || showOrderForm) return;
    setActiveSubTab('orders');
    openCreateOrderForm();
  }, [
    autoOpenOrderForm,
    openCreateOrderForm,
    popupMode,
    setActiveSubTab,
    showOrderForm,
  ]);

  function toDateInputValue(value) {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return toLocalDateKey(dt);
  }

  const {
    orderDraftProjection,
    orderTotals,
    ledgerBalanceSummary,
    orderDetailSupplier,
    orderDetailIsEditable,
    orderProductOptions,
    supplierHistoryItems,
    getStatusBadgeForOrder,
    getPoPaymentBadgeForOrder,
    getLedgerRowStatusClassForEntry,
    getDistributorName,
    getLedgerBillNumber,
    lowStockProducts,
  } = usePurchaseManagementDerived({
    showOrderForm,
    orderFormData,
    purchaseOrders,
    products,
    distributors,
    operationsSummary,
    ledgerRecords,
    filters,
    orderDetail,
    calculateOrderItem,
    calculateOrderTotals,
    findProductForItem,
    getLedgerBalanceSummary,
    getDistributorProductOptions,
    getDistributorHistoryProducts,
    getOrderDistributorInfo,
    isPoEditable,
    getStatusBadge,
    getPoLifecycleStatus,
    getPoPaymentBadge,
    getPoPaymentStatus,
    getLedgerRowStatusClass,
    normalizePoPaymentStatus,
    toNumber,
  });
  const {
    orderDetailItems,
    getOrderDetailOriginalItem,
    hasOrderDetailItemChanged,
    getOrderDetailItemFieldChanged,
    getOrderDetailItemOriginalLabel,
    orderDetailHasComputedChanges,
    orderDetailComputedTotals,
    orderDetailDraftDiagnostics,
  } = useOrderDetailComputed({
    orderDetail,
    orderDetailDraft,
    orderDetailEditMode,
    products,
    findProductForItem,
    calculateOrderItem,
    toNumber,
    formatCurrency,
    normalizeGstRateOption,
    calculateOrderTotals,
    getOrderDisplayTotal,
    toDateInputValue,
  });
  const closeOrderReview = useCallback(() => {
    setOrderReviewMode(false);
  }, [setOrderReviewMode]);
  const saveCurrentOrderDraft = useCallback(() => {
    if (!showOrderForm) return false;
    if (!hasOpenDirtyOrderDraft) {
      setError('Add a supplier or items before saving a draft.');
      return false;
    }

    const now = Date.now();
    const nextDraftId = String(activeSavedOrderDraftIdRef.current || activeSavedOrderDraftId || '').trim()
      || `purchase-draft-${now}`;
    const supplierName = String(orderFormData?.supplier_name || orderFormData?.distributor_name || '').trim();
    const meaningfulItemCount = orderDraftProjection.rows.filter((row) => Number(row?.item?.product_id || 0) > 0).length;
    const draftTitle = supplierName
      ? `${supplierName} draft`
      : `Purchase draft ${new Date(now).toLocaleString()}`;
    const cleanItems = (Array.isArray(orderFormData?.items) ? orderFormData.items : [])
      .map((item) => {
        if (!item || typeof item !== 'object') return item;
        const {
          id,
          po_item_id,
          purchase_order_id,
          purchase_order_item_id,
          order_id,
          po_number,
          ...rest
        } = item;
        return rest;
      });
    const {
      id: orderId,
      po_number: orderPoNumber,
      purchase_order_id: orderPurchaseId,
      ...restOrderFormData
    } = orderFormData || {};
    const nextDraftEntry = {
      id: nextDraftId,
      title: draftTitle,
      supplierName,
      updatedAt: now,
      itemCount: meaningfulItemCount,
      totalAmount: Number(orderTotals?.totalAmount || 0) || 0,
      orderFullMode,
      orderFormData: {
        ...restOrderFormData,
        items: cleanItems.length
          ? cleanItems
          : [createEmptyOrderItem()],
      },
    };

    persistSavedOrderDrafts((current) => [
      nextDraftEntry,
      ...current.filter((entry) => entry.id !== nextDraftId),
    ]);
    activeSavedOrderDraftIdRef.current = nextDraftId;
    setActiveSavedOrderDraftId(nextDraftId);
    setError('');
    setSuccess(supplierName ? `Saved draft for ${supplierName}.` : 'Saved purchase draft.');
    return true;
  }, [
    activeSavedOrderDraftId,
    createEmptyOrderItem,
    hasOpenDirtyOrderDraft,
    orderDraftProjection.rows,
    orderFormData,
    orderFullMode,
    orderTotals?.totalAmount,
    persistSavedOrderDrafts,
    setError,
    setSuccess,
    showOrderForm,
  ]);
  const openSavedOrderDraft = useCallback((draftId) => {
    const selectedDraft = savedOrderDrafts.find((entry) => entry.id === draftId);
    if (!selectedDraft) {
      setError('Saved draft not found.');
      return;
    }

    const restoredOrderForm = selectedDraft.orderFormData && typeof selectedDraft.orderFormData === 'object'
      ? normalizeRestoredOrderForm(selectedDraft.orderFormData)
      : null;
    if (!restoredOrderForm) {
      setError('Saved draft is missing order details.');
      return;
    }

    shortcutDraftHadMeaningfulItemsRef.current = false;
    setShortcutDraftContext(null);
    orderSubmitLockRef.current = false;
    setActiveSubTab('orders');
    setEditingOrderId(null);
    setOrderFullMode(Boolean(selectedDraft.orderFullMode));
    setOrderReviewMode(false);
    setOrderSubmitting(false);
    setLoadingDistributorItems(false);
    setActivePoProductField({ mode: 'entry', index: 0 });
    setOrderFormClientRequestId(createClientRequestId('po'));
    setOrderFormData({
      ...getDefaultOrderFormData(),
      ...restoredOrderForm,
      items: Array.isArray(restoredOrderForm.items) && restoredOrderForm.items.length
        ? restoredOrderForm.items
        : [createEmptyOrderItem()],
    });
    setShowOrderForm(true);
    activeSavedOrderDraftIdRef.current = selectedDraft.id;
    setActiveSavedOrderDraftId(selectedDraft.id);
    draftSaveCountRef.current = 0;
    setError('');
    setSuccess(`Opened ${selectedDraft.title}.`);
  }, [
    createClientRequestId,
    createEmptyOrderItem,
    getDefaultOrderFormData,
    orderSubmitLockRef,
    savedOrderDrafts,
    setActivePoProductField,
    setActiveSavedOrderDraftId,
    setActiveSubTab,
    setEditingOrderId,
    setError,
    setLoadingDistributorItems,
    setOrderFormClientRequestId,
    setOrderFormData,
    setOrderFullMode,
    setOrderReviewMode,
    setOrderSubmitting,
    setShowOrderForm,
    setShortcutDraftContext,
    setSuccess,
    normalizeRestoredOrderForm,
  ]);
  const deleteSavedOrderDraft = useCallback((draftId) => {
    const deletedDraft = savedOrderDrafts.find((entry) => entry.id === draftId) || null;
    persistSavedOrderDrafts((current) => current.filter((entry) => entry.id !== draftId));
    if (activeSavedOrderDraftId === draftId) {
      activeSavedOrderDraftIdRef.current = '';
      setActiveSavedOrderDraftId('');
    }
    setSuccess(deletedDraft ? `Deleted ${deletedDraft.title}.` : 'Deleted saved draft.');
  }, [
    activeSavedOrderDraftId,
    persistSavedOrderDrafts,
    savedOrderDrafts,
    setSuccess,
  ]);
  const pageProps = buildPurchaseManagementPageProps(
    {
      loading, error, success, activeSubTab, handlePurchaseSectionChange, operationsSummary, purchaseReturns,
      operationsLoading, rollupParams, setRollupParams, openCreateOrderFormForDistributor,
      handleViewOrder, handleOpenPoPaymentById, openCreateOrderForm, handleOpenLedgerForm, handleReturnFormOpen,
      handleCloseSupplierVisit, handleReopenSupplierVisit,
      lowStockProducts,
      formatCurrency, toNumber, fetchDistributorLedger, filters, distributors, suppliers, handleFilterChange, purchaseOrders, isPoEditable,
      canAddPaymentToPo, canReceivePo, canClosePo, getPoPaymentStatus, handleOpenProcessModal,
      handleSendDistributorWhatsApp, sendingWhatsAppOrderId, handleReceiveClick, handleOpenPoPaymentModal,
      handleOpenPoCorrectionForm, poCorrectionSubmitting, handleUpdateStatus, handleDeleteOrder,
      getOrderDisplayTotal, getStatusBadgeForOrder, getPoPaymentBadgeForOrder, getPoBalanceDue, getPoNextAction,
      ledgerBalanceSummary, ledgerLoading, ledgerRecords, getLedgerRowStatusClassForEntry, getDistributorName,
      getLedgerTypeLabel, getEntryDisplayBalance, getLedgerBillNumber, handleOpenBrowserWorkspace,
      lastSavedOrderSummary, clearLastSavedOrderSummary,
    },
    {
      showOrderForm, closeOrderForm, poModalRef, isMobile, poModalSize, editingOrderId,
      handleOrderSubmit, handleOpenOrderReview, orderFullMode, setOrderFullMode, orderReviewMode, closeOrderReview,
      loadingDistributorItems, handleLoadDistributorItems,
      orderFormData, setOrderFormData, orderDraftProjection, handleDistributorInputChange, orderProductOptions, products, findProductForItem,
      getAllowedPurchaseUnitsForProduct, getPurchasePackStep, handleOrderProductInputChange,
      handleOrderProductFieldFocus, handleOrderItemChange, GST_RATE_OPTIONS, handleOrderItemRemove, handleOrderItemAdd,
      handleApplySupplierHistoryItem, handleApplyCatalogProducts, supplierHistoryItems, supplierRegisteredProducts: selectedSupplierRegisteredProducts,
      orderTotals, getProductSearchOptionLabel, orderSubmitting, savedOrderDrafts, saveCurrentOrderDraft, openSavedOrderDraft,
      deleteSavedOrderDraft, activeSavedOrderDraftId,
    },
    {
      showReceiveModal, selectedOrder, setShowReceiveModal, receiveSubmitting, handleReceiveSubmit, receiveData,
      setReceiveData, handleReceiveQtyStep, handleReceiveItemChange, getProductUomProfile,
      resolvePurchaseUnitForProduct, toBaseQtyForProduct,
    },
    {
      showOrderDetail, closeOrderDetail, orderDetail, orderDetailLoading, orderDetailSupplier, orderDetailEditMode,
      orderDetailDraft, handleOrderDetailFieldChange, formatDateTime, formatDate, getPoLifecycleStatus,
      getPoPaidAmount, orderDetailItems, getItemFinancials, getOrderDetailOriginalItem, hasOrderDetailItemChanged,
      getOrderDetailItemFieldChanged, handleOrderDetailProductInputChange, getProductSearchLabel,
      getOrderDetailItemOriginalLabel, handleOrderDetailItemChange, handleOrderDetailItemRemove,
      handleOrderDetailItemAdd, orderDetailHasComputedChanges, orderDetailComputedTotals, orderDetailDraftDiagnostics, orderDetailIsEditable,
      orderDetailSaving, handleOrderDetailSave, openOrderDetailEditMode, handlePrintOrderDetail,
    },
    {
      showProcessModal, processingOrder, closeProcessModal, handleProcessSubmit, processSubmitting, processFormData,
      setProcessFormData, showPoPaymentModal, paymentOrder, closePoPaymentModal, handlePoPaymentSubmit,
      poPaymentSubmitting, poPaymentFormData, setPoPaymentFormData,
    },
    {
      showLedgerForm, closeLedgerForm, ledgerSubmitting, handleLedgerSubmit, ledgerFormData, setLedgerFormData,
      showPoCorrectionForm, selectedCorrectionOrder, closePoCorrectionForm, handlePoCorrectionSubmit,
      poCorrectionFormData, setPoCorrectionFormData, poCorrectionContext, showReturnForm, closeReturnForm,
      returnSubmitting, handleReturnSubmit, returnFormData, setReturnFormData, handleReturnItemAdd,
      handleReturnItemChange, handleReturnItemRemove,
    },
    {
      popupMode,
      showSectionTabs,
    },
  );

  return pageProps;
};

export default usePurchaseManagementController;

