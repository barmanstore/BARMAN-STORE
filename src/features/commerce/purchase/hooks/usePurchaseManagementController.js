import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCheck, Clock, DollarSign, Truck, Wallet } from 'lucide-react';
import { createClientRequestId, purchaseOrdersApi, distributorsApi, productsApi, purchaseReturnsApi, distributorLedgerApi } from '../api/index.js';
import { printHtmlDocument, escapeHtml } from '../../../../shared/utils/printService';
import { formatCurrency, formatDate } from '../../../../shared/utils/formatters';
import { getTodayDate, formatDateTime, toLocalDateKey } from '../../../../shared/utils/dateTime';
import { getLedgerTypeLabel, toNumber } from '../../../../shared/utils/ledger';
import useIsMobile from '../../../../shared/hooks/useIsMobile';
import usePopupDraftPersistence from '../../../../shared/hooks/usePopupDraftPersistence';
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
  mergeProductsById,
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
  resolveProductByInput as resolveProductByInputHelper,
  getDistributorProductOptions as getDistributorProductOptionsHelper,
  getDistributorProductHistoryEntry as getDistributorProductHistoryEntryHelper,
  getDistributorHistoryProducts as getDistributorHistoryProductsHelper,
} from '../utils/productSearch';
import { addLocalLedgerEntry } from '../utils/localLedgerStorage';
import createDefaultOperationsSummary from '../utils/operationsSummary';
import buildPurchaseManagementPageProps from '../utils/buildPurchaseManagementPageProps';

const LOCAL_LEDGER_KEY = 'purchase_distributor_ledger_local_entries';
const PO_MODAL_SIZE_KEY = 'po_entry_modal_size_v1';

const usePurchaseManagementController = ({
  user,
  shortcutOpenOrderRequest = 0,
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

  const {
    activeSubTab, setActiveSubTab, purchaseOrders, setPurchaseOrders, purchaseReturns, setPurchaseReturns,
    distributors, setDistributors, products, setProducts, loading, setLoading, error, setError, success, setSuccess,
    orderSubmitting, setOrderSubmitting, orderFormClientRequestId, setOrderFormClientRequestId, orderSubmitLockRef,
    filters, setFilters, showOrderForm, setShowOrderForm, showPoProductForm, setShowPoProductForm,
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
    loadingDistributorItems, setLoadingDistributorItems, activePoProductField, setActivePoProductField, poProductFormTarget, setPoProductFormTarget,
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
  const {
    fetchOrders,
    fetchReturns,
    fetchDistributorLedger,
  } = usePurchaseDataFetch({
    distributorsApi,
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

  const {
    getDistributorProductOptions,
    handleDistributorInputChange,
    handleOrderItemAdd,
    handleOrderItemRemove,
    handleOrderProductFieldFocus,
    handleLoadDistributorItems,
    handleOpenPoProductForm,
    closePoProductForm,
    handleInlinePoProductCreate,
    handlePoProductSave,
    handleFilterChange,
    openCreateOrderForm,
    openCreateOrderFormForDistributor,
    closeOrderForm,
    handlePurchaseSectionChange,
    handleOrderSubmit,
    handleEditOrder,
    handleOrderItemChange,
    handleOrderProductInputChange,
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
    getDistributorHistoryProductsHelper,
    createEmptyOrderItem,
    activePoProductField,
    setActivePoProductField,
    setPoProductFormTarget,
    setShowPoProductForm,
    poProductFormTarget,
    setProducts,
    mergeProductsById,
    setFilters,
    setActiveSubTab,
    getDefaultOrderFormData,
    setEditingOrderId,
    setOrderFullMode,
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
  });

  useEffect(() => {
    if (!shortcutOpenOrderRequest) return;
    setActiveSubTab('orders');
    openCreateOrderForm();
    if (typeof onShortcutOpenOrderHandled === 'function') {
      onShortcutOpenOrderHandled();
    }
  }, [
    onShortcutOpenOrderHandled,
    openCreateOrderForm,
    setActiveSubTab,
    shortcutOpenOrderRequest,
  ]);

  const defaultOrderFormData = getDefaultOrderFormData();
  const hasMeaningfulOrderItems = Array.isArray(orderFormData?.items)
    && orderFormData.items.some((item) => (
      Number(item?.product_id || item?.productId || 0) > 0
      || String(item?.product_query || item?.name || '').trim().length > 0
      || Number(item?.quantity || 0) > 1
      || Number(item?.rate || item?.unit_price || 0) > 0
    ));
  const orderDraftDirty = Boolean(
    popupMode
    && showOrderForm
    && !editingOrderId
    && (
      String(orderFormData?.distributor_id || '').trim()
      || String(orderFormData?.distributor_name || '').trim()
      || String(orderFormData?.strict_due_date || '').trim()
      || String(orderFormData?.strict_due_note || '').trim()
      || String(orderFormData?.notes || '').trim()
      || String(orderFormData?.expected_delivery || '').trim() !== String(defaultOrderFormData.expected_delivery || '').trim()
      || hasMeaningfulOrderItems
    )
  );

  usePopupDraftPersistence({
    kind: 'purchase',
    storageKey: draftStorageKey,
    enabled: popupMode,
    isDirty: orderDraftDirty,
    draft: {
      activeSubTab: 'orders',
      orderFullMode,
      orderFormData,
      showOrderForm,
    },
    onRestore: (draft) => {
      const restoredOrderForm = draft?.orderFormData && typeof draft.orderFormData === 'object'
        ? draft.orderFormData
        : null;
      if (!restoredOrderForm) return;
      restoredPopupDraftRef.current = true;
      setActiveSubTab('orders');
      setEditingOrderId(null);
      setOrderFullMode(Boolean(draft?.orderFullMode));
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
    operationsCardItems,
    orderDetailSupplier,
    orderDetailIsEditable,
    orderProductOptions,
    getStatusBadgeForOrder,
    getPoPaymentBadgeForOrder,
    getLedgerRowStatusClassForEntry,
    getDistributorName,
    getLedgerBillNumber,
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
    getOrderDistributorInfo,
    isPoEditable,
    getStatusBadge,
    getPoLifecycleStatus,
    getPoPaymentBadge,
    getPoPaymentStatus,
    getLedgerRowStatusClass,
    normalizePoPaymentStatus,
    formatCurrency,
    toNumber,
    icons: {
      Wallet,
      DollarSign,
      AlertTriangle,
      CheckCheck,
      Clock,
      Truck,
    },
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
  const pageProps = buildPurchaseManagementPageProps(
    {
      loading, error, success, activeSubTab, handlePurchaseSectionChange, operationsSummary, purchaseReturns,
      operationsLoading, operationsCardItems, rollupParams, setRollupParams, openCreateOrderFormForDistributor,
      handleViewOrder, handleOpenPoPaymentById, openCreateOrderForm, handleOpenLedgerForm, handleReturnFormOpen,
      formatCurrency, toNumber, filters, distributors, handleFilterChange, purchaseOrders, isPoEditable,
      canAddPaymentToPo, canReceivePo, canClosePo, getPoPaymentStatus, handleOpenProcessModal,
      handleSendDistributorWhatsApp, sendingWhatsAppOrderId, handleReceiveClick, handleOpenPoPaymentModal,
      handleOpenPoCorrectionForm, poCorrectionSubmitting, handleUpdateStatus, handleDeleteOrder,
      getOrderDisplayTotal, getStatusBadgeForOrder, getPoPaymentBadgeForOrder, getPoBalanceDue, getPoNextAction,
      ledgerBalanceSummary, ledgerLoading, ledgerRecords, getLedgerRowStatusClassForEntry, getDistributorName,
      getLedgerTypeLabel, getEntryDisplayBalance, getLedgerBillNumber,
    },
    {
      showOrderForm, closeOrderForm, poModalRef, isMobile, poModalSize, editingOrderId,
      handleOrderSubmit, orderFullMode, setOrderFullMode, loadingDistributorItems, handleLoadDistributorItems,
      orderFormData, setOrderFormData, orderDraftProjection, handleDistributorInputChange, orderProductOptions, products, findProductForItem,
      getAllowedPurchaseUnitsForProduct, getPurchasePackStep, handleOrderProductInputChange,
      handleOrderProductFieldFocus, handleOrderItemChange, GST_RATE_OPTIONS, handleOrderItemRemove, handleOrderItemAdd,
      handleOpenPoProductForm, handleInlinePoProductCreate, orderTotals, getProductSearchOptionLabel, orderSubmitting, showPoProductForm, poProductFormTarget,
      closePoProductForm, handlePoProductSave,
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

