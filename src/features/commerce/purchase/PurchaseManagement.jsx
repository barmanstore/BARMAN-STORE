import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, X, Search, Package, Truck, RotateCcw, Eye, Check, Clock, ArrowUpDown, Printer, DollarSign, MessageCircle, BellRing, Wallet, AlertTriangle, Sparkles, CheckCheck } from 'lucide-react';
import { createClientRequestId, purchaseOrdersApi, distributorsApi, productsApi, purchaseReturnsApi, stockLedgerApi, distributorLedgerApi } from '../../../services/api';
import { printHtmlDocument, escapeHtml } from '../../../utils/printService';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { getTodayDate, formatDateTime, toLocalDateKey } from '../../../utils/dateTime';
import { getLedgerTypeLabel, toNumber } from '../../../utils/ledger';
import useIsMobile from '../../../hooks/useIsMobile';
import useLockBodyScroll from '../../../hooks/useLockBodyScroll';
import useOrderDetailComputed from './hooks/useOrderDetailComputed';
import usePurchaseCalculations from './hooks/usePurchaseCalculations';
import usePoModalSizing from './hooks/usePoModalSizing';
import usePurchaseDataFetch from './hooks/usePurchaseDataFetch';
import usePurchaseLookups from './hooks/usePurchaseLookups';
import usePurchaseOrderFormItems from './hooks/usePurchaseOrderFormItems';
import usePurchaseOrderItemHandlers from './hooks/usePurchaseOrderItemHandlers';
import usePurchaseReceiveHandlers from './hooks/usePurchaseReceiveHandlers';
import usePurchasePaymentHandlers from './hooks/usePurchasePaymentHandlers';
import usePurchaseStatusHandlers from './hooks/usePurchaseStatusHandlers';
import usePurchaseProcessHandlers from './hooks/usePurchaseProcessHandlers';
import usePurchaseOrderDetailHandlers from './hooks/usePurchaseOrderDetailHandlers';
import usePurchaseReturnHandlers from './hooks/usePurchaseReturnHandlers';
import usePurchaseLedgerCorrections from './hooks/usePurchaseLedgerCorrections';
import usePurchasePrintOrder from './hooks/usePurchasePrintOrder';
import PurchaseModals from './components/PurchaseModals';
import {
  PurchaseDashboardSection,
  PurchaseOrdersSection,
  PurchasePaymentsSection,
  PurchaseRemindersSection,
  PurchaseReturnsSection,
  PurchaseSectionTabs,
} from './components/sections';
import {
  createDefaultLedgerFormData,
  createDefaultOrderFormData,
  createDefaultPoCorrectionFormData,
  createDefaultPoPaymentFormData,
  createDefaultProcessFormData,
} from './utils/forms';
import {
  createEmptyOrderItem,
  findProductForItem,
  mergeProductsById,
} from './utils/items';
import {
  fromBaseQtyForProduct,
  getAllowedPurchaseUnitsForProduct,
  getProductUomProfile,
  getPurchasePackStep,
  resolvePurchaseUnitForProduct,
  toBaseQtyForProduct,
} from './utils/uom';
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
} from './utils/orders';
import {
  getLedgerRowStatusClass,
  getOrderDistributorInfo,
  getPoPaymentBadge,
  getStatusBadge,
} from './utils/orderPresentation.jsx';
import {
  getEntryDisplayBalance,
  getLedgerBalanceSummary,
  normalizeTextKey,
} from './utils/ledgerHelpers';
import {
  getProductSearchLabel,
  getProductSearchOptionLabel,
  resolveProductByInput as resolveProductByInputHelper,
  getDistributorProductOptions as getDistributorProductOptionsHelper,
  getDistributorHistoryProducts as getDistributorHistoryProductsHelper,
} from './utils/productSearch';
import { addLocalLedgerEntry } from './utils/localLedgerStorage';
import createDefaultOperationsSummary from './utils/operationsSummary';
import './PurchaseManagement.css';

function PurchaseManagement({ user }) {
  const isMobile = useIsMobile();
  const LOCAL_LEDGER_KEY = 'purchase_distributor_ledger_local_entries';
  const PO_MODAL_SIZE_KEY = 'po_entry_modal_size_v1';
  const getDefaultOrderFormData = createDefaultOrderFormData;
  const getDefaultProcessFormData = createDefaultProcessFormData;
  const getDefaultPoPaymentFormData = createDefaultPoPaymentFormData;
  const getDefaultLedgerFormData = createDefaultLedgerFormData;
  const getDefaultPoCorrectionFormData = createDefaultPoCorrectionFormData;

  const [activeSubTab, setActiveSubTab] = useState('dashboard');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderFormClientRequestId, setOrderFormClientRequestId] = useState(() => createClientRequestId('po'));
  const orderSubmitLockRef = useRef(false);

  // Filters
  const [filters, setFilters] = useState({
    distributor_id: '',
    status: '',
    payment_status: '',
    start_date: '',
    end_date: ''
  });

  // Form states
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showPoProductForm, setShowPoProductForm] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [ledgerSubmitting, setLedgerSubmitting] = useState(false);
  const [showPoCorrectionForm, setShowPoCorrectionForm] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processSubmitting, setProcessSubmitting] = useState(false);
  const [sendingWhatsAppOrderId, setSendingWhatsAppOrderId] = useState(null);
  const [processingOrder, setProcessingOrder] = useState(null);
  const [processFormData, setProcessFormData] = useState(getDefaultProcessFormData());
  const [showPoPaymentModal, setShowPoPaymentModal] = useState(false);
  const [poPaymentSubmitting, setPoPaymentSubmitting] = useState(false);
  const poPaymentLockRef = useRef(false);
  const poPaymentClientRequestIdRef = useRef('');
  const ledgerSubmitLockRef = useRef(false);
  const returnSubmitLockRef = useRef(false);
  const poCorrectionLockRef = useRef(false);
  const processSubmitLockRef = useRef(false);
  const receiveSubmitLockRef = useRef(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [poPaymentFormData, setPoPaymentFormData] = useState(getDefaultPoPaymentFormData());
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [selectedCorrectionOrder, setSelectedCorrectionOrder] = useState(null);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [rollupParams, setRollupParams] = useState({
    mode: '30',
    days: 30,
    start_date: '',
    end_date: '',
  });
  const [operationsSummary, setOperationsSummary] = useState(() => createDefaultOperationsSummary());
  const [ledgerFormData, setLedgerFormData] = useState(getDefaultLedgerFormData());
  const [poCorrectionFormData, setPoCorrectionFormData] = useState(getDefaultPoCorrectionFormData());
  const [poCorrectionContext, setPoCorrectionContext] = useState({
    expectedAmount: 0,
    currentImpact: 0,
    delta: 0,
    linkedEntries: 0
  });
  const [poCorrectionSubmitting, setPoCorrectionSubmitting] = useState(false);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [orderDetail, setOrderDetail] = useState(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetailEditMode, setOrderDetailEditMode] = useState(false);
  const [orderDetailSaving, setOrderDetailSaving] = useState(false);
  const [orderDetailDraft, setOrderDetailDraft] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderFullMode, setOrderFullMode] = useState(false);
  const [loadingDistributorItems, setLoadingDistributorItems] = useState(false);
  const [activePoProductField, setActivePoProductField] = useState({ mode: 'entry', index: null });
  const [poProductFormTarget, setPoProductFormTarget] = useState(null);
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
    setPoModalSize,
    poModalRef,
    handlePoModalResizeStart,
    isResizingPoModal,
  } = usePoModalSizing({
    isMobile,
    storageKey: PO_MODAL_SIZE_KEY,
    toNumber,
  });
  useLockBodyScroll(
    showOrderForm
    || showPoProductForm
    || showReceiveModal
    || showReturnForm
    || showLedgerForm
    || showPoCorrectionForm
    || showProcessModal
    || showPoPaymentModal
    || showOrderDetail
  );

  // Order form data
  const [orderFormData, setOrderFormData] = useState(getDefaultOrderFormData());

  // Receive form data
  const [receiveData, setReceiveData] = useState({
    invoice_number: '',
    items: []
  });

  // Return form data
  const [returnFormData, setReturnFormData] = useState({
    distributor_id: '',
    reference_po: '',
    return_type: 'return',
    reason: '',
    items: []
  });

  useEffect(() => {
    if (!success) return undefined;
    const timerId = window.setTimeout(() => setSuccess(''), 3200);
    return () => window.clearTimeout(timerId);
  }, [success]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const {
    resolveProductByInput,
    getDistributorProductOptions,
    getDistributorHistoryProducts,
    handleDistributorInputChange,
  } = usePurchaseLookups({
    distributors,
    products,
    purchaseOrders,
    buildOrderDraftItem,
    setOrderFormData,
    resolveProductByInputHelper,
    getDistributorProductOptionsHelper,
    getDistributorHistoryProductsHelper,
  });
  const {
    handleOrderItemAdd,
    handleOrderItemRemove,
    ensureOrderFormItemAtIndex,
    getTargetPoProductField,
    handleOrderProductFieldFocus,
    handleLoadDistributorItems,
  } = usePurchaseOrderFormItems({
    orderFormData,
    setOrderFormData,
    createEmptyOrderItem,
    activePoProductField,
    setActivePoProductField,
    setError,
    setSuccess,
    setLoadingDistributorItems,
    distributors,
    getDistributorHistoryProducts,
  });
  const {
    handleOrderItemChange,
    handleOrderProductInputChange,
  } = usePurchaseOrderItemHandlers({
    orderFormData,
    setOrderFormData,
    products,
    productsApi,
    resolveProductByInput,
    getProductSearchLabel,
    resolvePurchaseUnitForProduct,
    normalizeGstRateOption,
    toNumber,
    findProductForItem,
  });
  const {
    handleUpdateStatus,
    handleSendDistributorWhatsApp,
    handleDeleteOrder,
  } = usePurchaseStatusHandlers({
    purchaseOrdersApi,
    fetchOrders,
    fetchDistributorLedger,
    setError,
    setSuccess,
    setSendingWhatsAppOrderId,
  });
  const {
    handleReceiveClick,
    handleReceiveItemChange,
    handleReceiveQtyStep,
    handleReceiveSubmit,
  } = usePurchaseReceiveHandlers({
    receiveData,
    setReceiveData,
    selectedOrder,
    setSelectedOrder,
    setShowReceiveModal,
    setReceiveSubmitting,
    receiveSubmitLockRef,
    purchaseOrdersApi,
    user,
    fetchOrders,
    setError,
    toNumber,
  });
  const {
    handleOpenProcessModal,
    closeProcessModal,
    handleProcessSubmit,
  } = usePurchaseProcessHandlers({
    getDefaultProcessFormData,
    setProcessingOrder,
    setProcessFormData,
    setShowProcessModal,
    setProcessSubmitting,
    processSubmitLockRef,
    handleUpdateStatus,
    getTodayDate,
    toNumber,
    getOrderDisplayTotal,
    user,
    processingOrder,
    processFormData,
    setError,
  });
  const {
    handleOpenPoPaymentModal,
    handleOpenPoPaymentById,
    closePoPaymentModal,
    handlePoPaymentSubmit,
  } = usePurchasePaymentHandlers({
    purchaseOrders,
    getPoBalanceDue,
    getDefaultPoPaymentFormData,
    setPoPaymentFormData,
    setPaymentOrder,
    setShowPoPaymentModal,
    setPoPaymentSubmitting,
    poPaymentSubmitting,
    poPaymentLockRef,
    poPaymentClientRequestIdRef,
    purchaseOrdersApi,
    createClientRequestId,
    getTodayDate,
    toNumber,
    user,
    paymentOrder,
    poPaymentFormData,
    fetchOrders,
    fetchDistributorLedger,
    setError,
  });
  const {
    buildOrderDetailDraft,
    closeOrderDetail,
    handleOrderDetailFieldChange,
    handleOrderDetailItemChange,
    handleOrderDetailProductInputChange,
    handleOrderDetailItemAdd,
    handleOrderDetailItemRemove,
    openOrderDetailEditMode,
    handleOrderDetailSave,
    handleViewOrder,
  } = usePurchaseOrderDetailHandlers({
    orderDetail,
    orderDetailDraft,
    setOrderDetail,
    setOrderDetailDraft,
    setShowOrderDetail,
    setOrderDetailLoading,
    setOrderDetailEditMode,
    setOrderDetailSaving,
    setError,
    setSuccess,
    purchaseOrdersApi,
    products,
    toDateInputValue,
    getProductSearchLabel,
    resolvePurchaseUnitForProduct,
    normalizeGstRateOption,
    toNumber,
    calculateOrderItem,
    calculateOrderTotals,
    createEmptyOrderItem,
    isPoEditable,
    resolveProductByInput,
    getPurchaseRequestErrorMessage,
    fetchOrders,
  });
  const {
    handleReturnFormOpen,
    closeReturnForm,
    handleReturnItemAdd,
    handleReturnItemChange,
    handleReturnItemRemove,
    handleReturnSubmit,
  } = usePurchaseReturnHandlers({
    returnFormData,
    setReturnFormData,
    setShowReturnForm,
    setReturnSubmitting,
    returnSubmitLockRef,
    setError,
    products,
    resolvePurchaseUnitForProduct,
    findProductForItem,
    toNumber,
    purchaseReturnsApi,
    user,
    fetchReturns,
  });
  const {
    getLedgerRowsFromResponse,
    getPoLinkedLedgerRows,
    getPoLedgerImpact,
    closePoCorrectionForm,
    handleOpenPoCorrectionForm,
    handlePoCorrectionSubmit,
    handleOpenLedgerForm,
    closeLedgerForm,
    handleLedgerSubmit,
  } = usePurchaseLedgerCorrections({
    distributorLedgerApi,
    calculateOrderBalanceAmount,
    toNumber,
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
    setError,
    fetchDistributorLedger,
    user,
    setShowLedgerForm,
    setLedgerFormData,
    setLedgerSubmitting,
    ledgerSubmitLockRef,
    ledgerSubmitting,
    ledgerFormData,
    addLocalLedgerEntry,
    localLedgerKey: LOCAL_LEDGER_KEY,
    filters,
  });
  const { handlePrintOrderDetail } = usePurchasePrintOrder({
    products,
    distributors,
    getOrderDistributorInfo,
    resolvePurchaseUnitForProduct,
    getProductUomProfile,
    toBaseQtyForProduct,
    toNumber,
    getOrderDisplayTotal,
    getPoLifecycleStatus,
    getPoPaymentStatus,
    getPoPaidAmount,
    getPoBalanceDue,
    formatDate,
    formatCurrency,
    escapeHtml,
    printHtmlDocument,
    setError,
    findProductForItem,
  });

  function toDateInputValue(value) {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return toLocalDateKey(dt);
  }

  const handleOpenPoProductForm = () => {
    const target = getTargetPoProductField();
    ensureOrderFormItemAtIndex(target.index);
    setPoProductFormTarget(target);
    setActivePoProductField(target);
    setShowPoProductForm(true);
  };

  const closePoProductForm = () => {
    setShowPoProductForm(false);
    setPoProductFormTarget(null);
  };

  const mergeProductsIntoState = (incomingProducts = []) => {
    if (!Array.isArray(incomingProducts) || incomingProducts.length === 0) return;
    setProducts((prev) => mergeProductsById(prev, incomingProducts));
  };

  const applyCreatedProductToPoTarget = (product, target) => {
    if (!product || !target || !Number.isInteger(target.index) || target.index < 0) return;

    setOrderFormData((prev) => {
      const items = [...prev.items];
      while (items.length <= target.index) {
        items.push(createEmptyOrderItem());
      }
      const currentItem = items[target.index] || createEmptyOrderItem();
      items[target.index] = buildOrderDraftItem(product, {
        ...currentItem,
        quantity: currentItem.quantity,
        uom: currentItem.uom,
        last_purchase_hint: '',
      });
      return { ...prev, items };
    });
  };

  const handlePoProductSave = async (meta = {}) => {
    const savedProducts = Array.isArray(meta?.createdProducts) && meta.createdProducts.length > 0
      ? meta.createdProducts
      : (Array.isArray(meta?.savedProducts) ? meta.savedProducts : []);
    mergeProductsIntoState(savedProducts);

    const latestCreatedProduct = savedProducts[savedProducts.length - 1] || null;
    if (latestCreatedProduct && poProductFormTarget) {
      applyCreatedProductToPoTarget(latestCreatedProduct, poProductFormTarget);
      setSuccess(
        savedProducts.length > 1
          ? `${savedProducts.length} products added. Latest product inserted into the PO row.`
          : 'Product added and inserted into the PO row.'
      );
    } else if (savedProducts.length > 0) {
      setSuccess(savedProducts.length > 1 ? `${savedProducts.length} products added.` : 'Product added successfully.');
    }
  };

  const resetOrderForm = () => {
    setOrderFormData(getDefaultOrderFormData());
    setEditingOrderId(null);
    setOrderFullMode(false);
    setOrderSubmitting(false);
    setLoadingDistributorItems(false);
    setActivePoProductField({ mode: 'entry', index: null });
    setPoProductFormTarget(null);
    orderSubmitLockRef.current = false;
    setOrderFormClientRequestId(createClientRequestId('po'));
  };

  const openCreateOrderForm = () => {
    setError('');
    resetOrderForm();
    setShowOrderForm(true);
  };

  const handlePurchaseSectionChange = (sectionKey) => {
    setActiveSubTab(sectionKey);
  };

  const openCreateOrderFormForDistributor = (distributorId, options = {}) => {
    const distributor = distributors.find((entry) => String(entry.id) === String(distributorId));
    const suggestedItems = Array.isArray(options.suggested_items) ? options.suggested_items : [];
    setError('');
    setEditingOrderId(null);
    setOrderFullMode(false);
    setOrderFormData({
      distributor_id: distributor ? String(distributor.id) : String(distributorId || ''),
      distributor_name: distributor?.name || '',
      expected_delivery: options.expected_delivery || options.order_date || '',
      strict_due_date: options.strict_due_date || '',
      strict_due_note: options.strict_due_note || '',
      notes: options.notes || '',
      items: suggestedItems.length
        ? suggestedItems.map((item) => {
            const product = products.find((entry) => String(entry.id) === String(item.product_id || '')) || null;
            return buildOrderDraftItem(product, {
              ...item,
              quantity: Math.max(1, toNumber(item.quantity || 1)),
              last_purchase_hint: 'Suggested from recent distributor history',
            });
          })
        : [createEmptyOrderItem()],
    });
    setShowOrderForm(true);
  };

  const closeOrderForm = () => {
    closePoProductForm();
    setShowOrderForm(false);
    resetOrderForm();
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (orderSubmitLockRef.current || orderSubmitting) return;
    orderSubmitLockRef.current = true;
    setError('');

    try {
      setOrderSubmitting(true);
      const selectedDistributor = distributors.find(d => String(d.id) === String(orderFormData.distributor_id) && d.status === 'active');
      if (!selectedDistributor) {
        setError('Please select a valid distributor');
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

      const invalidTypedProducts = orderFormData.items.filter(item =>
        String(item.product_query || '').trim() && !item.product_id
      );
      if (invalidTypedProducts.length > 0) {
        setError('Please select valid products from suggestions for all typed product names');
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

      const validItems = orderFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

      const calculatedItems = validItems.map(item => {
        const line = calculateOrderItem(item);
        return {
          ...item,
          quantity: line.quantity,
          uom: line.uom,
          unit_price: line.rate,
          rate: line.rate,
          gst_rate: line.gstRate,
          discount_type: line.discountType,
          discount_value: line.discountValue,
          taxable_value: line.taxableValue,
          tax_amount: line.taxAmount,
          line_total: line.totalAmount
        };
      });

      const orderTotals = calculateOrderTotals(calculatedItems);
      const payload = {
        distributor_id: orderFormData.distributor_id,
        expected_delivery: orderFormData.expected_delivery,
        strict_due_date: orderFormData.strict_due_date || null,
        strict_due_note: orderFormData.strict_due_note || '',
        notes: orderFormData.notes,
        subtotal: orderTotals.taxableValue,
        taxable_value: orderTotals.taxableValue,
        tax_amount: orderTotals.taxAmount,
        total_amount: orderTotals.totalAmount,
        grand_total: orderTotals.totalAmount,
        total: orderTotals.totalAmount,
        items: calculatedItems,
        created_by: user?.id,
        client_request_id: editingOrderId ? undefined : orderFormClientRequestId,
      };

      if (editingOrderId) {
        await purchaseOrdersApi.update(editingOrderId, payload);
      } else {
        await purchaseOrdersApi.create(payload);
      }

      closeOrderForm();
      await fetchOrders();
    } catch (err) {
      setError(
        getPurchaseRequestErrorMessage(
          err,
          editingOrderId ? 'Failed to update purchase order' : 'Failed to create purchase order'
        )
      );
      setOrderSubmitting(false);
      orderSubmitLockRef.current = false;
    }
  };

  const handleEditOrder = async (orderId) => {
    try {
      setError('');
      const order = await purchaseOrdersApi.getById(orderId);
      if (!order || !isPoEditable(order)) {
        setError('Only prepared, sent, or revised orders can be edited');
        return;
      }

      const mappedItems = (order.items || []).map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        return buildOrderDraftItem(product, {
          ...item,
          product_query: item.product_name || '',
          quantity: toNumber(item.quantity),
          last_purchase_hint: '',
        });
      });

      setOrderFormData({
        distributor_id: order.distributor_id ? String(order.distributor_id) : '',
        distributor_name: order.distributor_name || distributors.find(d => String(d.id) === String(order.distributor_id))?.name || '',
        expected_delivery: toDateInputValue(order.expected_delivery),
        strict_due_date: toDateInputValue(order.strict_due_date),
        strict_due_note: order.strict_due_note || '',
        notes: order.notes || '',
        items: mappedItems.length ? mappedItems : [createEmptyOrderItem()]
      });
      setOrderFullMode(true);
      setEditingOrderId(order.id);
      setShowOrderForm(true);
    } catch (err) {
      setError(err.message || 'Failed to load order for edit');
    }
  };

  // Receive/status/process/payment handlers extracted to hooks

  // Order detail and return handlers extracted to hooks

  const getStatusBadgeForOrder = (order) => getStatusBadge(order, getPoLifecycleStatus);
  const getPoPaymentBadgeForOrder = (order) => getPoPaymentBadge(order, getPoPaymentStatus);
  const getLedgerRowStatusClassForEntry = (entry) => getLedgerRowStatusClass(entry, normalizePoPaymentStatus);


  // Print helpers extracted to hooks

  const getDistributorName = (entry) => {
    if (entry?.distributor_name) return entry.distributor_name;
    const distributorId = entry?.distributor_id;
    if (!distributorId) return '-';
    const distributor = distributors.find(d => String(d.id) === String(distributorId));
    return distributor?.name || '-';
  };

  const getLedgerBillNumber = (entry) => {
    return entry?.bill_number || entry?.linked_bill_number || entry?.po_bill_number || entry?.invoice_number || entry?.po_invoice_number || '-';
  };
  // Ledger correction handlers extracted to hooks

  const orderTotals = calculateOrderTotals(orderFormData.items);
  const ledgerBalanceSummary = getLedgerBalanceSummary(ledgerRecords, filters.distributor_id);
  const operationsCards = operationsSummary?.cards || {};
  const operationsCardItems = [
    {
      key: 'payable_today',
      label: 'Pay Today',
      value: formatCurrency(toNumber(operationsCards.payable_today_amount)),
      meta: `${toNumber(operationsCards.today_distributor_count)} order-day distributors`,
      tone: 'warning',
      icon: Wallet,
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      value: formatCurrency(toNumber(operationsCards.outstanding_amount)),
      meta: `${toNumber(operationsCards.tomorrow_distributor_count)} tomorrow prep`,
      tone: 'default',
      icon: DollarSign,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: formatCurrency(toNumber(operationsCards.overdue_amount)),
      meta: `${toNumber(operationsCards.weekly_distributor_count)} in weekly plan`,
      tone: 'danger',
      icon: AlertTriangle,
    },
    {
      key: 'predicted_today',
      label: 'Predicted Today',
      value: formatCurrency(toNumber(operationsCards.predicted_payment_today_amount)),
      meta: `${toNumber(operationsCards.close_ready_count)} ready to close`,
      tone: 'success',
      icon: CheckCheck,
    },
    {
      key: 'next_payment',
      label: 'Next Payment',
      value: operationsCards.next_payment_due_date || '-',
      meta: `${toNumber(operationsCards.predicted_payment_next_count)} predicted`,
      tone: 'default',
      icon: Clock,
    },
    {
      key: 'next_delivery',
      label: 'Next Delivery',
      value: operationsCards.next_delivery_date || '-',
      meta: `${toNumber(operationsCards.predicted_delivery_next_count)} predicted`,
      tone: 'default',
      icon: Truck,
    },
  ];
  const orderDetailSupplier = getOrderDistributorInfo(orderDetail, distributors);
  const orderDetailIsEditable = orderDetail ? isPoEditable(orderDetail) : false;
  const {
    orderDetailItems,
    getOrderDetailOriginalItem,
    hasOrderDetailItemChanged,
    getOrderDetailItemFieldChanged,
    getOrderDetailItemOriginalLabel,
    orderDetailHasComputedChanges,
    orderDetailComputedTotals,
  } = useOrderDetailComputed({
    orderDetail,
    orderDetailDraft,
    orderDetailEditMode,
    toNumber,
    formatCurrency,
    normalizeGstRateOption,
    calculateOrderTotals,
    getOrderDisplayTotal,
    toDateInputValue,
  });
  const orderProductOptions = useMemo(
    () => getDistributorProductOptions(orderFormData.distributor_id),
    [orderFormData.distributor_id, purchaseOrders, products]
  );

  if (loading) {
    return (
      <div className="purchase-management">
        <div className="loading">Loading purchase data...</div>
      </div>
    );
  }

  return (
    <div className="purchase-management">
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <PurchaseSectionTabs
        activeTab={activeSubTab}
        onChange={handlePurchaseSectionChange}
        counts={{
          reminders: operationsSummary?.reminders?.length || 0,
          returns: purchaseReturns?.length || 0,
        }}
      />

      {activeSubTab === 'dashboard' ? (
        <PurchaseDashboardSection
          operationsLoading={operationsLoading}
          operationsCardItems={operationsCardItems}
          operationsSummary={operationsSummary}
          rollupParams={rollupParams}
          setRollupParams={setRollupParams}
          onDraftDistributor={openCreateOrderFormForDistributor}
          onOpenOrder={handleViewOrder}
          onOpenPayable={handleOpenPoPaymentById}
          onNewOrder={openCreateOrderForm}
          onOpenLedgerForm={handleOpenLedgerForm}
          onOpenReturn={handleReturnFormOpen}
          formatCurrency={formatCurrency}
          toNumber={toNumber}
        />
      ) : null}

      {activeSubTab === 'orders' ? (
        <PurchaseOrdersSection
          filters={filters}
          distributors={distributors}
          onFilterChange={handleFilterChange}
          onOpenLedgerForm={handleOpenLedgerForm}
          onOpenReturn={handleReturnFormOpen}
          onNewOrder={openCreateOrderForm}
          purchaseOrders={purchaseOrders}
          isPoEditable={isPoEditable}
          canAddPaymentToPo={canAddPaymentToPo}
          canReceivePo={canReceivePo}
          canClosePo={canClosePo}
          getPoPaymentStatus={getPoPaymentStatus}
          handleViewOrder={handleViewOrder}
          handleOpenProcessModal={handleOpenProcessModal}
          handleSendDistributorWhatsApp={handleSendDistributorWhatsApp}
          sendingWhatsAppOrderId={sendingWhatsAppOrderId}
          handleReceiveClick={handleReceiveClick}
          handleOpenPoPaymentModal={handleOpenPoPaymentModal}
          handleOpenPoCorrectionForm={handleOpenPoCorrectionForm}
          poCorrectionSubmitting={poCorrectionSubmitting}
          handleUpdateStatus={handleUpdateStatus}
          handleDeleteOrder={handleDeleteOrder}
          getOrderDisplayTotal={getOrderDisplayTotal}
          getStatusBadge={getStatusBadgeForOrder}
          getPoPaymentBadge={getPoPaymentBadgeForOrder}
          getPoBalanceDue={getPoBalanceDue}
          getPoNextAction={getPoNextAction}
          formatCurrency={formatCurrency}
        />
      ) : null}

      {activeSubTab === 'payments' ? (
        <PurchasePaymentsSection
          filters={filters}
          distributors={distributors}
          onFilterChange={handleFilterChange}
          onOpenLedgerForm={handleOpenLedgerForm}
          ledgerBalanceSummary={ledgerBalanceSummary}
          payables={operationsSummary.payables || []}
          onOpenPayable={handleOpenPoPaymentById}
          ledgerLoading={ledgerLoading}
          ledgerRecords={ledgerRecords}
          getLedgerRowStatusClass={getLedgerRowStatusClassForEntry}
          getDistributorName={getDistributorName}
          getLedgerTypeLabel={getLedgerTypeLabel}
          formatCurrency={formatCurrency}
          toNumber={toNumber}
          getEntryDisplayBalance={getEntryDisplayBalance}
          getLedgerBillNumber={getLedgerBillNumber}
        />
      ) : null}

      {activeSubTab === 'reminders' ? (
        <PurchaseRemindersSection
          operationsLoading={operationsLoading}
          operationsSummary={operationsSummary}
          onDraftDistributor={openCreateOrderFormForDistributor}
          onOpenOrder={handleViewOrder}
          formatCurrency={formatCurrency}
          toNumber={toNumber}
        />
      ) : null}

      {activeSubTab === 'returns' ? (
        <PurchaseReturnsSection
          filters={filters}
          distributors={distributors}
          onFilterChange={handleFilterChange}
          onOpenReturn={handleReturnFormOpen}
          purchaseReturns={purchaseReturns}
          formatCurrency={formatCurrency}
        />
      ) : null}

      <PurchaseModals
        showOrderForm={showOrderForm}
        closeOrderForm={closeOrderForm}
        poModalRef={poModalRef}
        isMobile={isMobile}
        poModalSize={poModalSize}
        handlePoModalResizeStart={handlePoModalResizeStart}
        editingOrderId={editingOrderId}
        handleOrderSubmit={handleOrderSubmit}
        orderFullMode={orderFullMode}
        setOrderFullMode={setOrderFullMode}
        loadingDistributorItems={loadingDistributorItems}
        handleLoadDistributorItems={handleLoadDistributorItems}
        orderFormData={orderFormData}
        setOrderFormData={setOrderFormData}
        handleDistributorInputChange={handleDistributorInputChange}
        distributors={distributors}
        orderProductOptions={orderProductOptions}
        products={products}
        findProductForItem={findProductForItem}
        calculateOrderItem={calculateOrderItem}
        getAllowedPurchaseUnitsForProduct={getAllowedPurchaseUnitsForProduct}
        getPurchasePackStep={getPurchasePackStep}
        handleOrderProductInputChange={handleOrderProductInputChange}
        handleOrderProductFieldFocus={handleOrderProductFieldFocus}
        handleOrderItemChange={handleOrderItemChange}
        GST_RATE_OPTIONS={GST_RATE_OPTIONS}
        toNumber={toNumber}
        handleOrderItemRemove={handleOrderItemRemove}
        handleOrderItemAdd={handleOrderItemAdd}
        handleOpenPoProductForm={handleOpenPoProductForm}
        orderTotals={orderTotals}
        getProductSearchOptionLabel={getProductSearchOptionLabel}
        orderSubmitting={orderSubmitting}
        showPoProductForm={showPoProductForm}
        closePoProductForm={closePoProductForm}
        handlePoProductSave={handlePoProductSave}
        showReceiveModal={showReceiveModal}
        selectedOrder={selectedOrder}
        setShowReceiveModal={setShowReceiveModal}
        receiveSubmitting={receiveSubmitting}
        handleReceiveSubmit={handleReceiveSubmit}
        receiveData={receiveData}
        setReceiveData={setReceiveData}
        handleReceiveQtyStep={handleReceiveQtyStep}
        handleReceiveItemChange={handleReceiveItemChange}
        formatCurrency={formatCurrency}
        getProductUomProfile={getProductUomProfile}
        resolvePurchaseUnitForProduct={resolvePurchaseUnitForProduct}
        toBaseQtyForProduct={toBaseQtyForProduct}
        showOrderDetail={showOrderDetail}
        closeOrderDetail={closeOrderDetail}
        orderDetail={orderDetail}
        orderDetailLoading={orderDetailLoading}
        orderDetailSupplier={orderDetailSupplier}
        orderDetailEditMode={orderDetailEditMode}
        orderDetailDraft={orderDetailDraft}
        handleOrderDetailFieldChange={handleOrderDetailFieldChange}
        formatDateTime={formatDateTime}
        formatDate={formatDate}
        getPoLifecycleStatus={getPoLifecycleStatus}
        getPoPaymentStatus={getPoPaymentStatus}
        getPoPaidAmount={getPoPaidAmount}
        getPoBalanceDue={getPoBalanceDue}
        getPoNextAction={getPoNextAction}
        orderDetailItems={orderDetailItems}
        getItemFinancials={getItemFinancials}
        getOrderDetailOriginalItem={getOrderDetailOriginalItem}
        hasOrderDetailItemChanged={hasOrderDetailItemChanged}
        getOrderDetailItemFieldChanged={getOrderDetailItemFieldChanged}
        handleOrderDetailProductInputChange={handleOrderDetailProductInputChange}
        getProductSearchLabel={getProductSearchLabel}
        getOrderDetailItemOriginalLabel={getOrderDetailItemOriginalLabel}
        handleOrderDetailItemChange={handleOrderDetailItemChange}
        handleOrderDetailItemRemove={handleOrderDetailItemRemove}
        handleOrderDetailItemAdd={handleOrderDetailItemAdd}
        orderDetailHasComputedChanges={orderDetailHasComputedChanges}
        orderDetailComputedTotals={orderDetailComputedTotals}
        orderDetailIsEditable={orderDetailIsEditable}
        orderDetailSaving={orderDetailSaving}
        handleOrderDetailSave={handleOrderDetailSave}
        openOrderDetailEditMode={openOrderDetailEditMode}
        handlePrintOrderDetail={handlePrintOrderDetail}
        showProcessModal={showProcessModal}
        processingOrder={processingOrder}
        closeProcessModal={closeProcessModal}
        handleProcessSubmit={handleProcessSubmit}
        processSubmitting={processSubmitting}
        processFormData={processFormData}
        setProcessFormData={setProcessFormData}
        getDistributorName={getDistributorName}
        getOrderDisplayTotal={getOrderDisplayTotal}
        showPoPaymentModal={showPoPaymentModal}
        paymentOrder={paymentOrder}
        closePoPaymentModal={closePoPaymentModal}
        handlePoPaymentSubmit={handlePoPaymentSubmit}
        poPaymentSubmitting={poPaymentSubmitting}
        poPaymentFormData={poPaymentFormData}
        setPoPaymentFormData={setPoPaymentFormData}
        showLedgerForm={showLedgerForm}
        closeLedgerForm={closeLedgerForm}
        ledgerSubmitting={ledgerSubmitting}
        handleLedgerSubmit={handleLedgerSubmit}
        ledgerFormData={ledgerFormData}
        setLedgerFormData={setLedgerFormData}
        showPoCorrectionForm={showPoCorrectionForm}
        selectedCorrectionOrder={selectedCorrectionOrder}
        closePoCorrectionForm={closePoCorrectionForm}
        poCorrectionSubmitting={poCorrectionSubmitting}
        handlePoCorrectionSubmit={handlePoCorrectionSubmit}
        poCorrectionFormData={poCorrectionFormData}
        setPoCorrectionFormData={setPoCorrectionFormData}
        poCorrectionContext={poCorrectionContext}
        showReturnForm={showReturnForm}
        closeReturnForm={closeReturnForm}
        returnSubmitting={returnSubmitting}
        handleReturnSubmit={handleReturnSubmit}
        returnFormData={returnFormData}
        setReturnFormData={setReturnFormData}
        handleReturnItemAdd={handleReturnItemAdd}
        handleReturnItemChange={handleReturnItemChange}
        handleReturnItemRemove={handleReturnItemRemove}
      />
    </div>
  );
}

export default PurchaseManagement;
