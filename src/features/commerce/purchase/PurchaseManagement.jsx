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
    fetchData();
  }, []);

  useEffect(() => {
    if (!success) return undefined;
    const timerId = window.setTimeout(() => setSuccess(''), 3200);
    return () => window.clearTimeout(timerId);
  }, [success]);

  useEffect(() => {
    fetchOrders();
  }, [filters]);


  useEffect(() => {
    if (activeSubTab === 'dashboard' || activeSubTab === 'payments' || activeSubTab === 'reminders') {
      fetchOperationsSummary();
    }
    if (activeSubTab === 'payments') {
      fetchDistributorLedger();
    }
    if (activeSubTab === 'returns') {
      fetchReturns();
    }
  }, [activeSubTab, filters.distributor_id, purchaseOrders, rollupParams.mode, rollupParams.days, rollupParams.start_date, rollupParams.end_date]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [distributorsData, productsData] = await Promise.all([
        distributorsApi.getAll(),
        productsApi.getAll()
      ]);
      setDistributors(distributorsData || []);
      setProducts(productsData || []);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const orders = await purchaseOrdersApi.getAll(filters);
      setPurchaseOrders(orders || []);
    } catch (err) {
      setError('Failed to load purchase orders');
    }
  };

  const fetchOperationsSummary = async () => {
    try {
      setOperationsLoading(true);
      const params = {};
      if (filters.distributor_id) params.distributor_id = filters.distributor_id;
      if (rollupParams.mode === 'custom') {
        if (rollupParams.start_date) params.rollup_start_date = rollupParams.start_date;
        if (rollupParams.end_date) params.rollup_end_date = rollupParams.end_date;
      } else if (rollupParams.days) {
        params.rollup_days = rollupParams.days;
      }
      const summary = await purchaseOrdersApi.getOperationsSummary(params);
      setOperationsSummary(summary || {
        cards: {},
        today_distributors: [],
        tomorrow_distributors: [],
        weekly_distributors: [],
        predicted_payments_today: [],
        predicted_payments_next: [],
        predicted_deliveries_next: [],
        reminders: [],
        payables: [],
        workflow: [],
        distributor_insights: [],
        action_rollups: {
          range: { start_date: null, end_date: null },
          actions: [],
          totals: {},
          by_day: [],
          by_weekday: [],
        },
      });
    } catch (err) {
      setOperationsSummary({
        cards: {
          outstanding_amount: 0,
          payable_today_amount: 0,
          overdue_amount: 0,
          predicted_payment_today_amount: 0,
          predicted_payment_next_count: 0,
          predicted_delivery_next_count: 0,
          next_payment_due_date: null,
          next_delivery_date: null,
          paid_today_amount: 0,
          reminder_count: 0,
          waiting_bill_count: 0,
          waiting_delivery_count: 0,
          close_ready_count: 0,
          today_distributor_count: 0,
          tomorrow_distributor_count: 0,
          weekly_distributor_count: 0,
        },
        today_distributors: [],
        tomorrow_distributors: [],
        weekly_distributors: [],
        predicted_payments_today: [],
        predicted_payments_next: [],
        predicted_deliveries_next: [],
        reminders: [],
        payables: [],
        workflow: [],
        distributor_insights: [],
        action_rollups: {
          range: { start_date: null, end_date: null },
          actions: [],
          totals: {},
          by_day: [],
          by_weekday: [],
        },
      });
    } finally {
      setOperationsLoading(false);
    }
  };

  const fetchReturns = async () => {
    try {
      const returns = await purchaseReturnsApi.getAll(filters);
      setPurchaseReturns(returns || []);
    } catch (err) {
      setError('Failed to load purchase returns');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const resolveDistributorByInput = (value) => {
    const query = String(value || '').trim().toLowerCase();
    if (!query) return null;
    return distributors.find(d =>
      d.status === 'active' && (
        String(d.id) === query ||
        String(d.name || '').trim().toLowerCase() === query
      )
    ) || null;
  };

  const resolveProductByInput = (value) => resolveProductByInputHelper(value, products);
  const getDistributorProductOptions = (distributorId) => getDistributorProductOptionsHelper({
    distributorId,
    products,
    purchaseOrders,
  });

  const handleDistributorInputChange = (value) => {
    const match = resolveDistributorByInput(value);
    setOrderFormData(prev => ({
      ...prev,
      distributor_name: value,
      distributor_id: match ? String(match.id) : ''
    }));
  };

  const toDateInputValue = (value) => {
    if (!value) return '';
    const raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    return toLocalDateKey(dt);
  };

  const ensureOrderFormItemAtIndex = (index) => {
    setOrderFormData((prev) => {
      const items = [...prev.items];
      while (items.length <= index) {
        items.push(createEmptyOrderItem());
      }
      return { ...prev, items };
    });
  };

  const getTargetPoProductField = () => {
    const items = Array.isArray(orderFormData.items) ? orderFormData.items : [];
    if (
      activePoProductField?.mode === 'entry' &&
      Number.isInteger(activePoProductField?.index) &&
      activePoProductField.index >= 0
    ) {
      return activePoProductField;
    }
    const emptyIndex = items.findIndex(
      (item) => !String(item?.product_id || '').trim() && !String(item?.product_query || '').trim()
    );
    if (emptyIndex >= 0) {
      return { mode: 'entry', index: emptyIndex };
    }
    return { mode: 'entry', index: items.length };
  };

  const handleOrderProductFieldFocus = (index) => {
    setActivePoProductField({ mode: 'entry', index });
  };

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

  // Order form handlers
  const handleOrderItemAdd = () => {
    setOrderFormData(prev => ({
      ...prev,
      items: [...prev.items, createEmptyOrderItem()]
    }));
  };

  const getDistributorHistoryProducts = (distributorId) => getDistributorHistoryProductsHelper({
    distributorId,
    products,
    purchaseOrders,
    buildOrderDraftItem,
  });

  const handleLoadDistributorItems = () => {
    const selectedDistributor = distributors.find(
      (entry) => String(entry.id) === String(orderFormData.distributor_id) && entry.status === 'active'
    );
    if (!selectedDistributor) {
      setError('Select a valid distributor before loading items');
      return;
    }

    setError('');
    setLoadingDistributorItems(true);
    try {
      const existingProductIds = new Set(
        (orderFormData.items || [])
          .map((item) => String(item?.product_id || '').trim())
          .filter(Boolean)
      );
      const nextItems = getDistributorHistoryProducts(selectedDistributor.id)
        .filter((item) => !existingProductIds.has(String(item.product_id || '').trim()))
        .slice(0, 10);

      if (!nextItems.length) {
        setSuccess('No more distributor history items are available to load.');
        return;
      }

      setOrderFormData((prev) => ({
        ...prev,
        items: [...(prev.items || []), ...nextItems],
      }));
      setSuccess(`Loaded ${nextItems.length} distributor item${nextItems.length === 1 ? '' : 's'} with qty 1.`);
    } finally {
      setLoadingDistributorItems(false);
    }
  };

  const fetchDistributorLedger = async () => {
    try {
      setLedgerLoading(true);
      const localEntries = getLocalLedgerEntries(LOCAL_LEDGER_KEY)
        .filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      const response = filters.distributor_id
        ? await distributorLedgerApi.getByDistributor(filters.distributor_id, { limit: 100 })
        : await distributorLedgerApi.getAll({ limit: 100 });
      const apiRecords = Array.isArray(response)
        ? response
        : (response?.rows || response?.data || response?.transactions || []);
      setLedgerRecords(mergeLedgerRecords(apiRecords, localEntries, derivedEntries));
    } catch (err) {
      const localEntries = getLocalLedgerEntries(LOCAL_LEDGER_KEY)
        .filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      setLedgerRecords(mergeLedgerRecords([], localEntries, derivedEntries));
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleOrderItemChange = async (index, field, value) => {
    const items = [...orderFormData.items];
    const nextValue = field === 'gst_rate' ? normalizeGstRateOption(value) : value;
    items[index][field] = nextValue;
    if (field === 'quantity') {
      items[index].quantity = Math.max(1, toNumber(nextValue));
    }

    if (field === 'product_id') {
      const selectedProductId = String(value || '');
      const product = products.find(p => String(p.id) === selectedProductId);
      if (product) {
        const baseRate = toNumber(product.price);
        const defaultUom = resolvePurchaseUnitForProduct(product, product.base_unit || product.uom || 'pcs');
        items[index].product_name = product.name;
        items[index].product_query = getProductSearchLabel(product);
        items[index].unit_price = baseRate;
        items[index].rate = baseRate;
        items[index].uom = defaultUom;
        items[index].last_purchase_hint = '';
      } else {
        items[index].product_query = '';
        items[index].product_name = '';
        items[index].uom = 'pcs';
        items[index].last_purchase_hint = '';
      }
      setOrderFormData(prev => ({ ...prev, items }));

      if (!selectedProductId) return;

      try {
        const suggestion = await productsApi.getLastPurchase(selectedProductId);
        if (!suggestion?.found) return;

        setOrderFormData(prev => {
          const nextItems = [...prev.items];
          const current = nextItems[index];
          if (!current || String(current.product_id) !== selectedProductId) return prev;
          const selectedProduct = products.find((p) => String(p.id) === selectedProductId) || null;

          const suggestedRate = toNumber(suggestion.rate ?? suggestion.unit_price ?? current.rate ?? current.unit_price);
          const suggestedGst = normalizeGstRateOption(suggestion.gst_rate ?? current.gst_rate ?? 5);
          const suggestedDate = suggestion.created_at ? new Date(suggestion.created_at).toLocaleDateString() : '';
          const suggestedPo = suggestion.po_number || 'last PO';
          const suggestedUom = resolvePurchaseUnitForProduct(
            selectedProduct,
            suggestion.uom || current.uom || selectedProduct?.base_unit || selectedProduct?.uom || 'pcs'
          );

          nextItems[index] = {
            ...current,
            unit_price: suggestedRate,
            rate: suggestedRate,
            gst_rate: suggestedGst,
            uom: suggestedUom,
            last_purchase_hint: `Suggested from ${suggestedPo}${suggestedDate ? ` (${suggestedDate})` : ''}`,
          };
          return { ...prev, items: nextItems };
        });
      } catch (_) {
        // keep product defaults when suggestion API is unavailable
      }
      return;
    }

    if (field === 'uom') {
      const selectedProduct = findProductForItem(products, items[index]);
      items[index].uom = resolvePurchaseUnitForProduct(selectedProduct, value);
    }

    if (field === 'rate') {
      items[index].unit_price = toNumber(value);
    }

    if (field === 'unit_price') {
      items[index].rate = toNumber(value);
    }

    setOrderFormData(prev => ({ ...prev, items }));
  };

  const handleOrderProductInputChange = (index, value) => {
    const items = [...orderFormData.items];
    items[index].product_query = value;
    const match = resolveProductByInput(value);
    if (!match) {
      items[index].product_id = '';
      items[index].product_name = value;
      items[index].last_purchase_hint = '';
      setOrderFormData(prev => ({ ...prev, items }));
      return;
    }
    setOrderFormData(prev => ({ ...prev, items }));
    handleOrderItemChange(index, 'product_id', String(match.id));
  };

  const handleOrderItemRemove = (index) => {
    setOrderFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
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

  // Receive handlers
  const handleReceiveClick = (order) => {
    setSelectedOrder(order);
    setReceiveData({
      invoice_number: '',
      items: order.items?.map(item => ({
        item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        ordered_quantity: item.quantity,
        received_quantity: item.quantity - (item.received_quantity || 0),
        unit_price: item.unit_price
      })) || []
    });
    setShowReceiveModal(true);
  };

  const handleReceiveItemChange = (index, field, value) => {
    const items = [...receiveData.items];
    items[index][field] = value;
    setReceiveData(prev => ({ ...prev, items }));
  };

  const handleReceiveQtyStep = (index, delta) => {
    const item = receiveData.items[index];
    if (!item) return;
    const currentQty = toNumber(item.received_quantity);
    const nextQty = Math.max(0, Math.min(toNumber(item.ordered_quantity), currentQty + delta));
    handleReceiveItemChange(index, 'received_quantity', nextQty);
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    if (receiveSubmitLockRef.current) return;
    receiveSubmitLockRef.current = true;
    setError('');
    setReceiveSubmitting(true);

    try {
      const validItems = receiveData.items.filter(item => item.received_quantity > 0);
      if (validItems.length === 0) {
        receiveSubmitLockRef.current = false;
        setReceiveSubmitting(false);
        setError('Please receive at least one item');
        return;
      }

      await purchaseOrdersApi.receive(selectedOrder.id, {
        invoice_number: receiveData.invoice_number,
        items: validItems,
        received_by: user?.id
      });

      setShowReceiveModal(false);
      setSelectedOrder(null);
      setReceiveData({ invoice_number: '', items: [] });
      fetchOrders();
    } catch (err) {
      setError(err.message || 'Failed to receive inventory');
    } finally {
      receiveSubmitLockRef.current = false;
      setReceiveSubmitting(false);
    }
  };

  // Status update
  const handleUpdateStatus = async (orderId, status, extra = {}) => {
    try {
      setError('');
      const normalizedStatus = String(status || '').trim().toLowerCase();
      const statusResult = normalizedStatus === 'processed'
        ? await purchaseOrdersApi.process(orderId, extra)
        : await purchaseOrdersApi.updateStatus(orderId, status, extra);
      if (normalizedStatus === 'processed' && Number(statusResult?.cap_applied_count || 0) > 0) {
        const lines = (statusResult.cap_adjustments || [])
          .slice(0, 5)
          .map((row) => {
            const name = String(row?.product_name || row?.product_id || 'Product');
            return `- ${name}: final stock ${row?.final_stock}`;
          });
        const moreCount = Math.max(0, Number(statusResult.cap_applied_count || 0) - lines.length);
        const moreText = moreCount > 0 ? `\n...and ${moreCount} more item(s)` : '';
        window.alert(
          `Stock cap (${Number(statusResult?.stock_cap || 50)}) was applied to ${statusResult.cap_applied_count} item(s).\n\n${lines.join('\n')}${moreText}`
        );
      }
      await fetchOrders();
      await fetchDistributorLedger();
    } catch (err) {
      setError(err?.message || 'Failed to update status');
      throw err;
    }
  };

  const handleSendDistributorWhatsApp = async (order) => {
    if (!order?.id) return;
    try {
      setError('');
      setSuccess('');
      setSendingWhatsAppOrderId(order.id);
      const response = await purchaseOrdersApi.sendDistributorWhatsApp(order.id);
      const notice = response?.distributor_notice || null;
      const whatsappUrl = String(notice?.whatsapp?.whatsapp_url || '').trim();
      if (!whatsappUrl) {
        setError('WhatsApp message link is not available for this distributor.');
        return;
      }
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      setSuccess('Distributor WhatsApp message is ready.');
    } catch (err) {
      setSuccess('');
      setError(err.message || 'Failed to prepare distributor WhatsApp message');
    } finally {
      setSendingWhatsAppOrderId(null);
    }
  };

  const handleOpenProcessModal = (order) => {
    if (!order) return;
    setError('');
    setProcessingOrder(order);
    setProcessFormData({
      ...getDefaultProcessFormData(),
      bill_number: String(order.bill_number || order.invoice_number || '').trim(),
      paid_amount: '',
      payment_reference: String(order.bill_number || order.invoice_number || '').trim(),
      payment_date: getTodayDate(),
      payment_notes: '',
    });
    setShowProcessModal(true);
  };

  const closeProcessModal = () => {
    setShowProcessModal(false);
    setProcessingOrder(null);
    setProcessFormData(getDefaultProcessFormData());
    setProcessSubmitting(false);
    processSubmitLockRef.current = false;
  };

  const handleProcessSubmit = async (e) => {
    e.preventDefault();
    if (!processingOrder) return;
    if (processSubmitLockRef.current) return;
    processSubmitLockRef.current = true;
    const billNumber = String(processFormData.bill_number || '').trim();
    if (!billNumber) {
      processSubmitLockRef.current = false;
      setError('Bill number is required to process PO');
      return;
    }
    const paidAmount = Math.max(0, toNumber(processFormData.paid_amount));
    const poTotal = Math.max(0, getOrderDisplayTotal(processingOrder));
    if (paidAmount > poTotal) {
      processSubmitLockRef.current = false;
      setError('Initial paid amount cannot exceed PO total');
      return;
    }

    try {
      setError('');
      setProcessSubmitting(true);
      await handleUpdateStatus(processingOrder.id, 'processed', {
        bill_number: billNumber,
        paid_amount: Number(paidAmount.toFixed(2)),
        payment_mode: processFormData.payment_mode,
        payment_reference: processFormData.payment_reference || billNumber,
        payment_date: processFormData.payment_date || getTodayDate(),
        payment_notes: processFormData.payment_notes,
        updated_by: user?.id,
      });
      closeProcessModal();
    } catch (err) {
      setError(err?.message || 'Failed to process purchase order');
      setProcessSubmitting(false);
    } finally {
      processSubmitLockRef.current = false;
    }
  };

  const handleOpenPoPaymentModal = (order) => {
    if (!order) return;
    const balanceDue = getPoBalanceDue(order);
    setError('');
    setPaymentOrder(order);
    setPoPaymentFormData({
      ...getDefaultPoPaymentFormData(),
      amount: balanceDue > 0 ? balanceDue.toFixed(2) : '',
      reference: String(order.bill_number || order.invoice_number || order.po_number || '').trim(),
      transaction_date: getTodayDate(),
      notes: '',
    });
    poPaymentLockRef.current = false;
    poPaymentClientRequestIdRef.current = createClientRequestId('popay');
    setShowPoPaymentModal(true);
  };

  const handleOpenPoPaymentById = (orderId) => {
    const order = (purchaseOrders || []).find((row) => Number(row.id) === Number(orderId));
    if (order) handleOpenPoPaymentModal(order);
  };

  const closePoPaymentModal = () => {
    setShowPoPaymentModal(false);
    setPaymentOrder(null);
    setPoPaymentFormData(getDefaultPoPaymentFormData());
    setPoPaymentSubmitting(false);
    poPaymentLockRef.current = false;
    poPaymentClientRequestIdRef.current = '';
  };

  const handlePoPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentOrder) return;
    if (poPaymentSubmitting || poPaymentLockRef.current) return;
    poPaymentLockRef.current = true;
    const amount = Math.max(0, toNumber(poPaymentFormData.amount));
    const balanceDue = getPoBalanceDue(paymentOrder);
    if (amount <= 0) {
      poPaymentLockRef.current = false;
      setError('Payment amount must be greater than 0');
      return;
    }
    if (amount > balanceDue) {
      poPaymentLockRef.current = false;
      setError('Payment amount cannot exceed current balance due');
      return;
    }

    try {
      setError('');
      setPoPaymentSubmitting(true);
      const clientRequestId = poPaymentClientRequestIdRef.current || createClientRequestId('popay');
      poPaymentClientRequestIdRef.current = clientRequestId;
      await purchaseOrdersApi.addPayment(paymentOrder.id, {
        amount: Number(amount.toFixed(2)),
        payment_mode: poPaymentFormData.payment_mode,
        reference: poPaymentFormData.reference,
        transaction_date: poPaymentFormData.transaction_date || getTodayDate(),
        notes: poPaymentFormData.notes,
        created_by: user?.id,
        client_request_id: clientRequestId,
      });
      closePoPaymentModal();
      fetchOrders();
      fetchDistributorLedger();
    } catch (err) {
      setError(err?.message || 'Failed to add PO payment');
      setPoPaymentSubmitting(false);
      poPaymentLockRef.current = false;
    }
  };

  // Delete order
  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to delete this purchase order?')) return;

    try {
      await purchaseOrdersApi.delete(orderId);
      fetchOrders();
    } catch (err) {
      setError('Failed to delete order');
    }
  };

  const buildOrderDetailDraft = (order) => {
    if (!order) return null;
    return {
      expected_delivery: toDateInputValue(order.expected_delivery),
      strict_due_date: toDateInputValue(order.strict_due_date),
      notes: order.notes || '',
      strict_due_note: order.strict_due_note || '',
      items: (order.items || []).map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        return {
          id: item.id,
          product_id: item.product_id ? String(item.product_id) : '',
          product_query: product ? getProductSearchLabel(product) : (item.product_name || ''),
          product_name: item.product_name || '',
        quantity: Math.max(1, toNumber(item.quantity)),
          uom: resolvePurchaseUnitForProduct(product, item.uom || product?.base_unit || product?.uom || 'pcs'),
          rate: toNumber(item.rate ?? item.unit_price),
          unit_price: toNumber(item.unit_price ?? item.rate),
          gst_rate: normalizeGstRateOption(item.gst_rate),
          discount_type: item.discount_type === 'fixed' ? 'fixed' : 'percent',
          discount_value: Math.max(0, toNumber(item.discount_value)),
          taxable_value: toNumber(item.taxable_value),
          tax_amount: toNumber(item.tax_amount),
          line_total: toNumber(item.line_total ?? item.total),
        };
      }),
    };
  };

  const closeOrderDetail = () => {
    setShowOrderDetail(false);
    setOrderDetail(null);
    setOrderDetailEditMode(false);
    setOrderDetailSaving(false);
    setOrderDetailDraft(null);
  };

  const handleOrderDetailFieldChange = (field, value) => {
    setOrderDetailDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleOrderDetailItemChange = (index, field, value) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const current = items[index];
      if (!current) return prev;
      const nextValue = field === 'gst_rate' ? normalizeGstRateOption(value) : value;
      const nextItem = { ...current, [field]: nextValue };
      if (field === 'uom') {
        const selectedProduct = products.find((product) => String(product?.id || '') === String(current.product_id || '')) || null;
        nextItem.uom = resolvePurchaseUnitForProduct(selectedProduct, value);
      }
      if (field === 'rate') {
        nextItem.rate = toNumber(value);
        nextItem.unit_price = toNumber(value);
      }
      if (field === 'unit_price') {
        nextItem.unit_price = toNumber(value);
        nextItem.rate = toNumber(value);
      }
      if (field === 'quantity') {
        nextItem.quantity = Math.max(1, toNumber(value));
      }
      items[index] = nextItem;
      return { ...prev, items };
    });
  };

  const handleOrderDetailProductInputChange = (index, value) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const current = items[index];
      if (!current) return prev;

      const nextItem = {
        ...current,
        product_query: value,
      };
      const match = resolveProductByInput(value);
      if (!match) {
        nextItem.product_id = '';
        nextItem.product_name = value;
        items[index] = nextItem;
        return { ...prev, items };
      }

      const defaultUom = resolvePurchaseUnitForProduct(match, match.base_unit || match.uom || 'pcs');
      nextItem.product_id = String(match.id);
      nextItem.product_name = match.name;
      nextItem.product_query = getProductSearchLabel(match);
      nextItem.uom = defaultUom;
      nextItem.rate = toNumber(match.price);
      nextItem.unit_price = toNumber(match.price);
      items[index] = nextItem;
      return { ...prev, items };
    });
  };

  const handleOrderDetailItemAdd = () => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...(prev.items || []),
          {
            ...createEmptyOrderItem(),
            quantity: 1,
            gst_rate: normalizeGstRateOption(5),
          },
        ],
      };
    });
  };

  const handleOrderDetailItemRemove = (index) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: (prev.items || []).filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const openOrderDetailEditMode = () => {
    if (!orderDetail || !isPoEditable(orderDetail)) return;
    setOrderDetailDraft(buildOrderDetailDraft(orderDetail));
    setOrderDetailEditMode(true);
  };

  const handleOrderDetailSave = async () => {
    if (!orderDetail || !orderDetailDraft) return;
    const validItems = (orderDetailDraft.items || []).filter((item) => item.product_id && toNumber(item.quantity) > 0);
    if (!validItems.length) {
      setError('Please keep at least one valid item in the purchase order');
      return;
    }

    try {
      setError('');
      setOrderDetailSaving(true);
      const calculatedItems = validItems.map((item) => {
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
          line_total: line.totalAmount,
        };
      });
      const totals = calculateOrderTotals(calculatedItems);
      const payload = {
        distributor_id: orderDetail.distributor_id,
        expected_delivery: orderDetailDraft.expected_delivery || null,
        strict_due_date: orderDetailDraft.strict_due_date || null,
        strict_due_note: orderDetailDraft.strict_due_note || '',
        notes: orderDetailDraft.notes || '',
        subtotal: totals.taxableValue,
        taxable_value: totals.taxableValue,
        tax_amount: totals.taxAmount,
        total_amount: totals.totalAmount,
        grand_total: totals.totalAmount,
        total: totals.totalAmount,
        items: calculatedItems,
      };
      await purchaseOrdersApi.update(orderDetail.id, payload);
      const refreshedOrder = await purchaseOrdersApi.getById(orderDetail.id);
      setOrderDetail(refreshedOrder);
      setOrderDetailDraft(buildOrderDetailDraft(refreshedOrder));
      setOrderDetailEditMode(false);
      setSuccess('Purchase order updated.');
      await fetchOrders();
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'Failed to update purchase order'));
    } finally {
      setOrderDetailSaving(false);
    }
  };

  // View order details
  const handleViewOrder = async (orderId) => {
    try {
      setShowOrderDetail(true);
      setOrderDetail(null);
      setOrderDetailLoading(true);
      setOrderDetailEditMode(false);
      setOrderDetailDraft(null);
      const order = await purchaseOrdersApi.getById(orderId);
      setOrderDetail(order);
      setOrderDetailDraft(buildOrderDetailDraft(order));
    } catch (err) {
      setError('Failed to load order details');
      setShowOrderDetail(false);
    } finally {
      setOrderDetailLoading(false);
    }
  };

  // Return form handlers
  const handleReturnFormOpen = () => {
    setReturnFormData({
      distributor_id: '',
      reference_po: '',
      return_type: 'return',
      reason: '',
      items: []
    });
    setReturnSubmitting(false);
    returnSubmitLockRef.current = false;
    setShowReturnForm(true);
  };

  const closeReturnForm = () => {
    setShowReturnForm(false);
    setReturnFormData({ distributor_id: '', reference_po: '', return_type: 'return', reason: '', items: [] });
    setReturnSubmitting(false);
    returnSubmitLockRef.current = false;
  };

  const handleReturnItemAdd = () => {
    setReturnFormData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', product_name: '', quantity: 1, uom: 'pcs', unit_price: 0, reason: '' }]
    }));
  };

  const handleReturnItemChange = (index, field, value) => {
    const items = [...returnFormData.items];
    items[index][field] = value;

    if (field === 'product_id') {
      const product = products.find(p => p.id === parseInt(value));
      if (product) {
        const defaultUom = resolvePurchaseUnitForProduct(product, product.base_unit || product.uom || 'pcs');
        items[index].product_name = product.name;
        items[index].unit_price = toNumber(product.price);
        items[index].uom = defaultUom;
      }
    }

    if (field === 'uom') {
      const product = findProductForItem(products, items[index]);
      items[index].uom = resolvePurchaseUnitForProduct(product, value);
    }

    setReturnFormData(prev => ({ ...prev, items }));
  };

  const handleReturnItemRemove = (index) => {
    setReturnFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (returnSubmitLockRef.current) return;
    returnSubmitLockRef.current = true;
    setError('');
    setReturnSubmitting(true);

    try {
      const validItems = returnFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        returnSubmitLockRef.current = false;
        setReturnSubmitting(false);
        setError('Please add at least one item');
        return;
      }

      const normalizedItems = validItems.map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        return {
          ...item,
          product_id: Number(item.product_id),
          quantity: Math.max(0, toNumber(item.quantity)),
          unit_price: Math.max(0, toNumber(item.unit_price)),
          uom: resolvePurchaseUnitForProduct(product, item.uom || product?.base_unit || product?.uom || 'pcs'),
        };
      });

      await purchaseReturnsApi.create({
        distributor_id: returnFormData.distributor_id,
        reference_po: returnFormData.reference_po,
        return_type: returnFormData.return_type,
        reason: returnFormData.reason,
        items: normalizedItems,
        created_by: user?.id
      });

      closeReturnForm();
      fetchReturns();
    } catch (err) {
      setError(err.message || 'Failed to create return');
    } finally {
      returnSubmitLockRef.current = false;
      setReturnSubmitting(false);
    }
  };

  const getStatusBadgeForOrder = (order) => getStatusBadge(order, getPoLifecycleStatus);
  const getPoPaymentBadgeForOrder = (order) => getPoPaymentBadge(order, getPoPaymentStatus);
  const getLedgerRowStatusClassForEntry = (entry) => getLedgerRowStatusClass(entry, normalizePoPaymentStatus);


  const getItemFinancials = (item) => {
    const product = findProductForItem(products, item);
    const profile = getProductUomProfile(product);
    const quantity = Math.max(0, toNumber(item?.quantity));
    const uom = resolvePurchaseUnitForProduct(product, item?.uom || profile.baseUnit);
    const quantityInBase = toBaseQtyForProduct(quantity, uom, product);
    const rate = toNumber(item?.rate ?? item?.unit_price);
    const fallbackLine = quantityInBase * rate;
    const taxableValue = toNumber(item?.taxable_value);
    const taxAmount = toNumber(item?.tax_amount);
    const lineTotal = toNumber(item?.line_total ?? item?.total);
    const resolvedTaxable = taxableValue > 0 ? taxableValue : (taxAmount > 0 ? Math.max(0, lineTotal - taxAmount) : lineTotal);
    const gstRate = toNumber(item?.gst_rate);
    return {
      quantity,
      quantityInBase,
      uom,
      rate,
      taxableValue: resolvedTaxable,
      taxAmount,
      lineTotal: lineTotal > 0 ? lineTotal : fallbackLine,
      gstRate,
      baseUnit: profile.baseUnit,
    };
  };

  const buildPurchaseOrderPrintHtml = (order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    const supplier = getOrderDistributorInfo(order, distributors);
    const rows = items.map((item, index) => {
      const line = getItemFinancials(item);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item?.product_name || '-')}</td>
          <td>${line.quantity}</td>
          <td>${escapeHtml(line.uom || '-')}</td>
          <td>${formatCurrency(line.rate)} / ${escapeHtml(line.baseUnit || 'pcs')}</td>
          <td>${line.gstRate.toFixed(2)}%</td>
          <td>${formatCurrency(line.taxableValue)}</td>
          <td>${formatCurrency(line.taxAmount)}</td>
          <td>${formatCurrency(line.lineTotal)}</td>
        </tr>
      `;
    }).join('');

    const taxable = toNumber(order?.taxable_value);
    const tax = toNumber(order?.tax_amount);
    const grand = toNumber(order?.total_amount || getOrderDisplayTotal(order));

    return `
      <div class="po-print">
        <div class="po-print-header">
          <div>
            <h1>Purchase Order</h1>
            <div class="muted">PO #${order?.po_number || '-'}</div>
          </div>
          <div class="meta">
            <div><strong>PO Status:</strong> ${String(getPoLifecycleStatus(order) || '-').toUpperCase()}</div>
            <div><strong>Payment:</strong> ${String(getPoPaymentStatus(order) || '-').toUpperCase()}</div>
            <div><strong>Paid:</strong> ${formatCurrency(getPoPaidAmount(order))}</div>
            <div><strong>Balance:</strong> ${formatCurrency(getPoBalanceDue(order))}</div>
            <div><strong>Date:</strong> ${formatDate(order?.created_at || order?.order_date)}</div>
            <div><strong>Expected:</strong> ${formatDate(order?.expected_delivery)}</div>
            <div><strong>Bill No:</strong> ${order?.bill_number || order?.invoice_number || '-'}</div>
          </div>
        </div>

        <div class="po-print-party">
          <div>
            <h3>Supplier</h3>
            <div>${escapeHtml(supplier.name)}</div>
            <div>${escapeHtml(supplier.phone)}</div>
            <div>${escapeHtml(supplier.address)}</div>
          </div>
          <div>
            <h3>Order Notes</h3>
            <div>${escapeHtml(order?.notes || '-')}</div>
          </div>
        </div>

        <table class="po-print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Qty</th>
              <th>UOM</th>
              <th>Rate</th>
              <th>GST %</th>
              <th>Taxable</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="9">No items</td></tr>'}</tbody>
        </table>

        <div class="po-print-summary">
          <div><span>Taxable Value</span><strong>${formatCurrency(taxable)}</strong></div>
          <div><span>GST</span><strong>${formatCurrency(tax)}</strong></div>
          <div class="grand"><span>Grand Total</span><strong>${formatCurrency(grand)}</strong></div>
        </div>
      </div>
    `;
  };

  const handlePrintOrderDetail = (order) => {
    if (!order) return;
    const html = buildPurchaseOrderPrintHtml(order);
    printHtmlDocument({
      title: `PO ${order?.po_number || ''}`,
      bodyHtml: html,
      cssText: `
        .po-print { max-width: 980px; margin: 0 auto; }
        .po-print-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
        .po-print-header h1 { margin: 0 0 6px; font-size: 26px; }
        .muted { color: #555; font-size: 13px; }
        .meta { font-size: 13px; line-height: 1.6; text-align: right; }
        .po-print-party { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
        .po-print-party h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; color: #444; }
        .po-print-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .po-print-table th, .po-print-table td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
        .po-print-table thead th { background: #f3f4f6; font-weight: 700; }
        .po-print-summary { margin-top: 14px; margin-left: auto; width: 320px; }
        .po-print-summary div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        .po-print-summary .grand { font-size: 15px; font-weight: 700; border-bottom: none; }
        @media print {
          body { margin: 0; padding: 10mm; }
          .po-print-table tr { page-break-inside: avoid; }
        }
      `,
      onError: (message) => setError(message),
    });
  };

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
  const getLedgerRowsFromResponse = (response) => {
    if (Array.isArray(response)) return response;
    return response?.rows || response?.data || response?.transactions || [];
  };
  const getPoLinkedLedgerRows = (rows, order) => {
    if (!order) return [];

    const orderId = String(order.id || '').trim();
    const poNumberKey = normalizeTextKey(order.po_number);

    return (rows || []).filter((entry) => {
      const source = normalizeTextKey(entry?.source);
      const sourceId = entry?.source_id ?? entry?.sourceId;
      if (
        (source === 'purchase_order' || source === 'po_correction') &&
        sourceId !== undefined &&
        sourceId !== null &&
        String(sourceId).trim() === orderId
      ) {
        return true;
      }

      const referenceKey = normalizeTextKey(entry?.reference || entry?.po_number);
      if (!poNumberKey || !referenceKey || referenceKey !== poNumberKey) return false;
      const descriptionKey = normalizeTextKey(entry?.description);
      return (
        descriptionKey.includes('purchase order') ||
        descriptionKey.includes('po correction') ||
        descriptionKey.includes('ledger correction')
      );
    });
  };
  const getPoLedgerImpact = (rows, order) => {
    return getPoLinkedLedgerRows(rows, order).reduce((sum, entry) => sum + getSignedLedgerAmount(entry), 0);
  };
  const closePoCorrectionForm = () => {
    setShowPoCorrectionForm(false);
    setSelectedCorrectionOrder(null);
    setPoCorrectionFormData(getDefaultPoCorrectionFormData());
    setPoCorrectionContext({
      expectedAmount: 0,
      currentImpact: 0,
      delta: 0,
      linkedEntries: 0
    });
    setPoCorrectionSubmitting(false);
    poCorrectionLockRef.current = false;
  };
  const handleOpenPoCorrectionForm = async (order) => {
    if (!order || !order.distributor_id) {
      setError('Cannot open correction form. Invalid purchase order/distributor.');
      return;
    }

    try {
      setError('');
      setPoCorrectionSubmitting(true);
      poCorrectionLockRef.current = false;

      const response = await distributorLedgerApi.getByDistributor(order.distributor_id, { limit: 500 });
      const rows = getLedgerRowsFromResponse(response);
      const linkedRows = getPoLinkedLedgerRows(rows, order);
      const expectedAmount = calculateOrderBalanceAmount(order);
      const currentImpact = getPoLedgerImpact(rows, order);
      const delta = Number((expectedAmount - currentImpact).toFixed(2));
      const suggestedType = delta < 0 ? 'payment' : 'credit';
      const suggestedAmount = Math.abs(delta);

      setSelectedCorrectionOrder(order);
      setPoCorrectionContext({
        expectedAmount,
        currentImpact,
        delta,
        linkedEntries: linkedRows.length
      });
      setPoCorrectionFormData({
        ...getDefaultPoCorrectionFormData(),
        type: suggestedType,
        amount: suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '',
        reference: order.po_number || '',
      });
      setShowPoCorrectionForm(true);
    } catch (err) {
      setError(err?.message || 'Failed to load PO ledger impact for correction');
    } finally {
      setPoCorrectionSubmitting(false);
    }
  };
  const handlePoCorrectionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCorrectionOrder) return;
    if (poCorrectionSubmitting || poCorrectionLockRef.current) return;
    poCorrectionLockRef.current = true;

    const amount = toNumber(poCorrectionFormData.amount);
    const reason = String(poCorrectionFormData.reason || '').trim();
    if (amount <= 0) {
      poCorrectionLockRef.current = false;
      setError('Correction amount must be greater than 0');
      return;
    }
    if (!reason) {
      poCorrectionLockRef.current = false;
      setError('Correction reason is required');
      return;
    }

    try {
      setError('');
      setPoCorrectionSubmitting(true);

      await distributorLedgerApi.addTransaction(selectedCorrectionOrder.distributor_id, {
        type: poCorrectionFormData.type,
        transaction_type: poCorrectionFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: poCorrectionFormData.payment_mode,
        reference: poCorrectionFormData.reference || selectedCorrectionOrder.po_number || '',
        description: `PO correction for ${selectedCorrectionOrder.po_number || selectedCorrectionOrder.id}: ${reason}`,
        transactionDate: poCorrectionFormData.transaction_date,
        source: 'po_correction',
        source_id: selectedCorrectionOrder.id,
        mode: 'manual',
        created_by: user?.id
      });

      closePoCorrectionForm();
      fetchDistributorLedger();
    } catch (err) {
      setError(err?.message || 'Failed to post PO correction');
    } finally {
      setPoCorrectionSubmitting(false);
      poCorrectionLockRef.current = false;
    }
  };

  const handleOpenLedgerForm = () => {
    setLedgerFormData({
      ...getDefaultLedgerFormData(),
      distributor_id: filters.distributor_id || ''
    });
    setLedgerSubmitting(false);
    ledgerSubmitLockRef.current = false;
    setShowLedgerForm(true);
  };

  const closeLedgerForm = () => {
    setShowLedgerForm(false);
    setLedgerFormData(getDefaultLedgerFormData());
    setLedgerSubmitting(false);
    ledgerSubmitLockRef.current = false;
  };

  const handleLedgerSubmit = async (e) => {
    e.preventDefault();
    if (ledgerSubmitting || ledgerSubmitLockRef.current) return;
    ledgerSubmitLockRef.current = true;
    setError('');

    const amount = toNumber(ledgerFormData.amount);
    if (!ledgerFormData.distributor_id) {
      ledgerSubmitLockRef.current = false;
      setError('Please select a distributor for ledger entry');
      return;
    }
    if (amount <= 0) {
      ledgerSubmitLockRef.current = false;
      setError('Please enter a valid amount');
      return;
    }

    try {
      setLedgerSubmitting(true);
      await distributorLedgerApi.addTransaction(ledgerFormData.distributor_id, {
        type: ledgerFormData.type,
        transaction_type: ledgerFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: ledgerFormData.payment_mode,
        reference: ledgerFormData.reference,
        description: ledgerFormData.description || `Manual ${ledgerFormData.type} entry`,
        transactionDate: ledgerFormData.transaction_date,
        mode: 'manual',
        created_by: user?.id
      });

      closeLedgerForm();
      fetchDistributorLedger();
    } catch (err) {
      const localEntry = {
        id: `local-${Date.now()}`,
        distributor_id: ledgerFormData.distributor_id,
        type: ledgerFormData.type,
        transaction_type: ledgerFormData.type,
        amount: Number(amount.toFixed(2)),
        payment_mode: ledgerFormData.payment_mode,
        reference: ledgerFormData.reference,
        description: ledgerFormData.description || `Manual ${ledgerFormData.type} entry`,
        transaction_date: ledgerFormData.transaction_date,
        created_at: new Date().toISOString(),
        mode: 'manual'
      };
      addLocalLedgerEntry(LOCAL_LEDGER_KEY, localEntry);
      closeLedgerForm();
      fetchDistributorLedger();
    } finally {
      setLedgerSubmitting(false);
      ledgerSubmitLockRef.current = false;
    }
  };

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
