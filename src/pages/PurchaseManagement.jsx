import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, X, Search, Package, Truck, RotateCcw, Eye, Check, Clock, ArrowUpDown, Printer } from 'lucide-react';
import { purchaseOrdersApi, distributorsApi, productsApi, purchaseReturnsApi, stockLedgerApi, distributorLedgerApi } from '../services/api';
import { printHtmlDocument, escapeHtml } from '../utils/printService';
import { formatCurrency, formatDate } from '../utils/formatters';
import { getTodayDate, formatDateTime, toLocalDateKey } from '../utils/dateTime';
import { getLedgerEntryTimestamp, getLedgerTypeLabel, getSignedLedgerAmount, toNumber } from '../utils/ledger';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from '../components/mobile/MobileBottomSheet';
import './PurchaseManagement.css';

const GST_RATE_OPTIONS = [0, 5, 18];

function PurchaseManagement({ user }) {
  const isMobile = useIsMobile();
  const LOCAL_LEDGER_KEY = 'purchase_distributor_ledger_local_entries';
  const PO_MODAL_SIZE_KEY = 'po_entry_modal_size_v1';
  const getDefaultQuickOrderFormData = () => ({
    distributor_id: '',
    distributor_name: '',
    order_date: getTodayDate(),
    notes: '',
    items: []
  });

  const getDefaultLedgerFormData = () => ({
    distributor_id: '',
    type: 'payment',
    amount: '',
    payment_mode: 'cash',
    transaction_date: getTodayDate(),
    reference: '',
    description: ''
  });
  const getDefaultPoCorrectionFormData = () => ({
    type: 'payment',
    amount: '',
    payment_mode: 'cash',
    transaction_date: getTodayDate(),
    reference: '',
    reason: ''
  });

  const getRecordDate = (entry) => getLedgerEntryTimestamp(entry, ['transaction_date', 'created_at', 'date']);
  const getRecordDateKey = (entry) => {
    if (entry?.transaction_date) return String(entry.transaction_date);
    if (entry?.created_at) return String(entry.created_at);
    if (entry?.date) return String(entry.date);
    return '';
  };
  const getNumericValue = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const normalizeGstRateOption = (value) => {
    const numeric = toNumber(value);
    return GST_RATE_OPTIONS.includes(numeric) ? numeric : 5;
  };
  const normalizeTextKey = (value) => String(value || '').trim().toLowerCase();
  const getEntryTypeKey = (entry) => String(entry?.type || entry?.transaction_type || '').trim().toLowerCase();
  const isCreditLikeEntry = (entry) => {
    const typeKey = getEntryTypeKey(entry);
    return typeKey === 'credit' || typeKey === 'given';
  };
  const getPurchaseOrderIdentityKey = (entry) => {
    if (!entry || !isCreditLikeEntry(entry)) return null;
    const distributorKey = getLedgerDistributorKey(entry);
    const sourceKey = normalizeTextKey(entry?.source);
    const sourceId = entry?.source_id ?? entry?.sourceId;
    if (sourceKey === 'purchase_order' && sourceId !== undefined && sourceId !== null && String(sourceId).trim() !== '') {
      return `${distributorKey}|poid:${String(sourceId).trim()}`;
    }

    const referenceKey = normalizeTextKey(entry?.reference || entry?.po_number);
    const descriptionKey = normalizeTextKey(entry?.description);
    if (referenceKey && descriptionKey.includes('purchase order')) {
      return `${distributorKey}|poref:${referenceKey}`;
    }
    return null;
  };
  const getLedgerAmountKey = (entry) => toNumber(entry?.amount).toFixed(2);
  const getEntryDisplayBalance = (entry) => {
    const apiBalance = getNumericValue(entry?.balance);
    if (apiBalance !== null) return apiBalance;
    return getNumericValue(entry?.computed_balance);
  };
  const getEntrySourceKey = (entry) => {
    const source = entry?.source ? String(entry.source) : '';
    const sourceId = entry?.source_id ?? entry?.sourceId;
    if (!source || sourceId === undefined || sourceId === null || sourceId === '') return null;
    return `${getLedgerDistributorKey(entry)}|${source}|${String(sourceId)}`;
  };
  const getEntryDedupKey = (entry) => {
    const poIdentityKey = getPurchaseOrderIdentityKey(entry);
    if (poIdentityKey) return `po:${poIdentityKey}`;

    const sourceKey = getEntrySourceKey(entry);
    if (sourceKey) return `src:${sourceKey}`;

    const distributorKey = getLedgerDistributorKey(entry);
    const type = String(entry?.type || entry?.transaction_type || '').toLowerCase();
    const reference = normalizeTextKey(entry?.reference || entry?.po_number);
    const amount = getLedgerAmountKey(entry);
    const dateKey = getRecordDateKey(entry);
    if (reference || dateKey) return `fallback:${distributorKey}|${type}|${reference}|${amount}|${dateKey}`;
    if (entry?.id !== undefined && entry?.id !== null && String(entry.id) !== '') return `id:${String(entry.id)}`;
    return null;
  };
  const getLedgerDistributorKey = (entry) => {
    if (entry?.distributor_id !== undefined && entry?.distributor_id !== null) return String(entry.distributor_id);
    if (entry?.distributor_name) return `name:${String(entry.distributor_name).toLowerCase()}`;
    return 'unknown';
  };

  const calculateOrderBalanceAmount = (order) => {
    const explicitTotal = toNumber(
      order?.total_amount ??
      order?.grand_total ??
      order?.line_total
    );
    if (explicitTotal > 0) return explicitTotal;

    const items = Array.isArray(order?.items) ? order.items : [];
    const itemsTotal = items.reduce((sum, item) => {
      const lineTotal = toNumber(item?.line_total ?? item?.total_amount ?? item?.total);
      if (lineTotal > 0) return sum + lineTotal;
      const lineTaxable = toNumber(item?.taxable_value);
      const lineTax = toNumber(item?.tax_amount);
      if (lineTaxable > 0 || lineTax > 0) return sum + lineTaxable + lineTax;
      const qty = toNumber(item?.quantity);
      const rate = toNumber(item?.rate ?? item?.unit_price);
      return sum + (qty * rate);
    }, 0);
    if (itemsTotal > 0) return itemsTotal;

    const taxable = toNumber(order?.taxable_value);
    const tax = toNumber(order?.tax_amount);
    if (taxable > 0 || tax > 0) return taxable + tax;

    return toNumber(order?.total);
  };

  const getOrderDisplayTotal = (order) => {
    return calculateOrderBalanceAmount(order);
  };

  const getLocalLedgerEntries = () => {
    try {
      const raw = localStorage.getItem(LOCAL_LEDGER_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  };

  const saveLocalLedgerEntries = (entries) => {
    try {
      localStorage.setItem(LOCAL_LEDGER_KEY, JSON.stringify(entries));
    } catch (e) {
      // ignore storage failure
    }
  };

  const addLocalLedgerEntry = (entry) => {
    const existing = getLocalLedgerEntries();
    saveLocalLedgerEntries([entry, ...existing]);
  };

  const getDerivedLedgerFromOrders = (orders, selectedDistributorId) => {
    const validStatuses = new Set(['confirmed']);
    const derived = (orders || [])
      .filter(order => validStatuses.has(String(order.status || '').toLowerCase()))
      .map(order => ({
      id: `po-${order.id}`,
      distributor_id: order.distributor_id,
      distributor_name: order.distributor_name,
      type: 'credit',
      transaction_type: 'credit',
      amount: calculateOrderBalanceAmount(order),
      payment_mode: 'credit',
      reference: order.po_number,
      bill_number: order.bill_number || order.invoice_number || null,
      description: `Purchase Order ${order.po_number || ''}`.trim(),
      transaction_date: order.created_at || order.order_date || order.expected_delivery || getTodayDate(),
      source: 'purchase_order',
      source_id: order.id,
      mode: 'automatic'
    }));

    if (!selectedDistributorId) return derived;
    return derived.filter(entry => String(entry.distributor_id) === String(selectedDistributorId));
  };

  const mergeLedgerRecords = (apiRecords, localRecords, derivedRecords) => {
    const baseRecords = Array.isArray(apiRecords) ? apiRecords : [];
    const local = Array.isArray(localRecords) ? localRecords : [];
    const derived = Array.isArray(derivedRecords) ? derivedRecords : [];
    const existingSourceKeys = new Set(
      [...baseRecords, ...local]
        .map(entry => getEntrySourceKey(entry))
        .filter(Boolean)
    );
    const missingDerived = derived.filter(entry => {
      const poIdentityKey = getPurchaseOrderIdentityKey(entry);
      if (poIdentityKey) {
        const duplicatePoEntry = [...baseRecords, ...local].some(existingEntry => {
          const existingPoIdentityKey = getPurchaseOrderIdentityKey(existingEntry);
          if (existingPoIdentityKey && existingPoIdentityKey === poIdentityKey) return true;

          if (!isCreditLikeEntry(existingEntry)) return false;
          const sameDistributor = getLedgerDistributorKey(existingEntry) === getLedgerDistributorKey(entry);
          if (!sameDistributor) return false;

          const sameReference = normalizeTextKey(existingEntry?.reference || existingEntry?.po_number) === normalizeTextKey(entry?.reference || entry?.po_number);
          const sameAmount = getLedgerAmountKey(existingEntry) === getLedgerAmountKey(entry);
          return sameReference && sameAmount;
        });
        if (duplicatePoEntry) return false;
      }

      const sourceKey = getEntrySourceKey(entry);
      return sourceKey ? !existingSourceKeys.has(sourceKey) : true;
    });
    const merged = [...baseRecords, ...local, ...missingDerived];

    const deduped = [];
    const seen = new Set();
    for (const entry of merged) {
      const key = getEntryDedupKey(entry);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      deduped.push(entry);
    }

    const runningBalanceByDistributor = {};
    const chronological = [...deduped].sort((a, b) => getRecordDate(a) - getRecordDate(b));
    const withBalances = chronological.map(entry => {
      const distributorKey = getLedgerDistributorKey(entry);
      const explicitBalance = getNumericValue(entry?.balance);
      if (explicitBalance !== null) {
        runningBalanceByDistributor[distributorKey] = explicitBalance;
      } else if (runningBalanceByDistributor[distributorKey] !== undefined) {
        runningBalanceByDistributor[distributorKey] += getSignedLedgerAmount(entry);
      } else if (baseRecords.length === 0) {
        runningBalanceByDistributor[distributorKey] = getSignedLedgerAmount(entry);
      }

      const nextBalance = runningBalanceByDistributor[distributorKey];
      return {
        ...entry,
        computed_balance: nextBalance === undefined ? null : nextBalance
      };
    });

    return withBalances.sort((a, b) => getRecordDate(b) - getRecordDate(a));
  };

  const getLedgerBalanceSummary = (records, selectedDistributorId) => {
    const balancesByDistributor = {};
    for (const entry of records || []) {
      const key = getLedgerDistributorKey(entry);
      if (balancesByDistributor[key] === undefined) {
        const displayBalance = getEntryDisplayBalance(entry);
        if (displayBalance !== null) {
          balancesByDistributor[key] = displayBalance;
        }
      }
    }

    if (selectedDistributorId) {
      const selectedKey = String(selectedDistributorId);
      let selectedBalance = 0;
      for (const [key, balance] of Object.entries(balancesByDistributor)) {
        if (key === selectedKey) {
          selectedBalance = balance;
          break;
        }
      }
      return {
        label: 'Distributor Balance',
        value: selectedBalance
      };
    }

    const totalBalance = Object.values(balancesByDistributor).reduce((sum, value) => sum + toNumber(value), 0);
    return {
      label: 'Total Balance (All Distributors)',
      value: totalBalance
    };
  };

  const calculateOrderItem = (item) => {
    const quantity = toNumber(item.quantity);
    const rate = toNumber(item.rate ?? item.unit_price);
    const grossAmount = quantity * rate;
    const discountType = item.discount_type === 'fixed' ? 'fixed' : 'percent';
    const discountValue = toNumber(item.discount_value);
    const discountAmountRaw = discountType === 'percent'
      ? (grossAmount * discountValue) / 100
      : discountValue;
    const discountAmount = Math.max(0, Math.min(discountAmountRaw, grossAmount));
    const taxableValue = Math.max(0, grossAmount - discountAmount);
    const gstRate = Math.max(0, toNumber(item.gst_rate));
    const taxAmount = (taxableValue * gstRate) / 100;
    const totalAmount = taxableValue + taxAmount;

    return {
      quantity,
      rate,
      grossAmount,
      discountType,
      discountValue,
      discountAmount,
      taxableValue,
      gstRate,
      taxAmount,
      totalAmount
    };
  };

  const calculateOrderTotals = (items = []) => {
    return items.reduce((totals, item) => {
      const line = calculateOrderItem(item);
      totals.grossAmount += line.grossAmount;
      totals.discountAmount += line.discountAmount;
      totals.taxableValue += line.taxableValue;
      totals.taxAmount += line.taxAmount;
      totals.totalAmount += line.totalAmount;
      return totals;
    }, {
      grossAmount: 0,
      discountAmount: 0,
      taxableValue: 0,
      taxAmount: 0,
      totalAmount: 0
    });
  };

  const [activeSubTab, setActiveSubTab] = useState('orders');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filters, setFilters] = useState({
    distributor_id: '',
    status: '',
    start_date: '',
    end_date: ''
  });

  // Form states
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showQuickOrderForm, setShowQuickOrderForm] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [showPoCorrectionForm, setShowPoCorrectionForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [selectedCorrectionOrder, setSelectedCorrectionOrder] = useState(null);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
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
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderEntryMode, setOrderEntryMode] = useState('detailed');
  const [poModalSize, setPoModalSize] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(PO_MODAL_SIZE_KEY) || '{}');
      const width = toNumber(parsed.width);
      const height = toNumber(parsed.height);
      return {
        width: width > 0 ? width : 980,
        height: height > 0 ? height : 760,
      };
    } catch (_) {
      return { width: 980, height: 760 };
    }
  });
  const [isResizingPoModal, setIsResizingPoModal] = useState(false);
  const poModalRef = useRef(null);
  const poModalResizeRef = useRef(null);
  const poModalSizeRef = useRef(poModalSize);

  // Order form data
  const [orderFormData, setOrderFormData] = useState({
    distributor_id: '',
    distributor_name: '',
    expected_delivery: '',
    notes: '',
    items: []
  });
  const [quickOrderFormData, setQuickOrderFormData] = useState(getDefaultQuickOrderFormData());

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
    fetchOrders();
  }, [filters]);

  useEffect(() => {
    poModalSizeRef.current = poModalSize;
  }, [poModalSize]);

  useEffect(() => {
    if (!isResizingPoModal) return undefined;

    const handleMouseMove = (event) => {
      const state = poModalResizeRef.current;
      if (!state) return;

      const nextWidth = state.startWidth + (event.clientX - state.startX);
      const nextHeight = state.startHeight + (event.clientY - state.startY);
      const minWidth = 760;
      const maxWidth = Math.max(minWidth, Math.floor(window.innerWidth * 0.95));
      const minHeight = 520;
      const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.9));

      setPoModalSize({
        width: Math.min(maxWidth, Math.max(minWidth, nextWidth)),
        height: Math.min(maxHeight, Math.max(minHeight, nextHeight)),
      });
    };

    const stopResizing = () => {
      setIsResizingPoModal(false);
      poModalResizeRef.current = null;
      document.body.classList.remove('po-modal-resizing');
      try {
        localStorage.setItem(PO_MODAL_SIZE_KEY, JSON.stringify(poModalSizeRef.current));
      } catch (_) {
        // ignore storage errors
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResizing);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizingPoModal]);

  useEffect(() => {
    if (activeSubTab === 'orders') {
      fetchDistributorLedger();
    }
  }, [activeSubTab, filters.distributor_id, purchaseOrders]);

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

  const resolveProductByInput = (value) => {
    const normalizeProductQuery = (rawValue) => String(rawValue || '')
      .replace(/^\[(recent|all)\]\s*/i, '')
      .trim();
    const query = normalizeProductQuery(value).toLowerCase();
    if (!query) return null;
    const formatProductSearchLabel = (product) => {
      if (!product) return '';
      const name = String(product.name || '').trim();
      const sku = String(product.sku || '').trim();
      return sku ? `${name} (${sku})` : name;
    };
    return products.find(p =>
      String(p.id) === query ||
      String(p.name || '').trim().toLowerCase() === query ||
      String(p.sku || '').trim().toLowerCase() === query ||
      formatProductSearchLabel(p).toLowerCase() === query
    ) || null;
  };

  const getProductSearchLabel = (product) => {
    if (!product) return '';
    const name = String(product.name || '').trim();
    const sku = String(product.sku || '').trim();
    return sku ? `${name} (${sku})` : name;
  };
  const getProductSearchOptionLabel = (product, scope = 'all') => {
    const base = getProductSearchLabel(product);
    return scope === 'recent' ? `[Recent] ${base}` : `[All] ${base}`;
  };

  const getDistributorProductOptions = (distributorId) => {
    const selectedDistributorId = String(distributorId || '').trim();
    if (!selectedDistributorId) {
      return {
        prioritized: [],
        all: products
      };
    }

    const productById = new Map(
      products.map((product) => [String(product.id), product])
    );
    const scoreByProductId = new Map();

    (purchaseOrders || []).forEach((order) => {
      if (String(order?.distributor_id || '') !== selectedDistributorId) return;

      const orderTime = new Date(order?.created_at || order?.order_date || order?.expected_delivery || 0).getTime();
      const items = Array.isArray(order?.items) ? order.items : [];

      items.forEach((item) => {
        const productId = String(item?.product_id || '').trim();
        if (!productId) return;

        const existing = scoreByProductId.get(productId) || { count: 0, latest: 0 };
        scoreByProductId.set(productId, {
          count: existing.count + 1,
          latest: Math.max(existing.latest, Number.isFinite(orderTime) ? orderTime : 0)
        });
      });
    });

    const prioritizedIds = [...scoreByProductId.entries()]
      .sort((a, b) => {
        if (b[1].latest !== a[1].latest) return b[1].latest - a[1].latest;
        return b[1].count - a[1].count;
      })
      .map(([productId]) => productId);

    const prioritized = prioritizedIds
      .map((productId) => productById.get(productId))
      .filter(Boolean);

    const prioritizedIdSet = new Set(prioritized.map((product) => String(product.id)));
    const all = products.filter((product) => !prioritizedIdSet.has(String(product.id)));

    return { prioritized, all };
  };

  const handleDistributorInputChange = (value) => {
    const match = resolveDistributorByInput(value);
    setOrderFormData(prev => ({
      ...prev,
      distributor_name: value,
      distributor_id: match ? String(match.id) : ''
    }));
  };

  const handleQuickDistributorInputChange = (value) => {
    const match = resolveDistributorByInput(value);
    setQuickOrderFormData(prev => ({
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

  // Order form handlers
  const handleOrderItemAdd = () => {
    setOrderFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: '',
        product_query: '',
        product_name: '',
        quantity: 1,
        uom: 'pcs',
        unit_price: 0,
        rate: 0,
        gst_rate: normalizeGstRateOption(5),
        discount_type: 'percent',
        discount_value: 0
      }]
    }));
  };

  const fetchDistributorLedger = async () => {
    try {
      setLedgerLoading(true);
      const localEntries = getLocalLedgerEntries().filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      const response = filters.distributor_id
        ? await distributorLedgerApi.getByDistributor(filters.distributor_id, { limit: 100 })
        : await distributorLedgerApi.getAll({ limit: 100 });
      const apiRecords = Array.isArray(response)
        ? response
        : (response?.rows || response?.data || response?.transactions || []);
      setLedgerRecords(mergeLedgerRecords(apiRecords, localEntries, derivedEntries));
    } catch (err) {
      const localEntries = getLocalLedgerEntries().filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      setLedgerRecords(mergeLedgerRecords([], localEntries, derivedEntries));
    } finally {
      setLedgerLoading(false);
    }
  };

  const createAutoDistributorCredit = async ({ distributorId, amount, poNumber, orderId, billNumber }) => {
    if (!distributorId || amount <= 0) return;

    await distributorLedgerApi.addTransaction(distributorId, {
      type: 'credit',
      transaction_type: 'credit',
      amount: Number(amount.toFixed(2)),
      payment_mode: 'credit',
      reference: poNumber || (orderId ? `PO-${orderId}` : ''),
      bill_number: billNumber || null,
      description: `Purchase Order ${poNumber || ''}${billNumber ? ` (Bill: ${billNumber})` : ''}`.trim(),
      transactionDate: getTodayDate(),
      source: 'purchase_order',
      source_id: orderId,
      mode: 'automatic',
      created_by: user?.id
    });
  };

  const handleOrderItemChange = async (index, field, value) => {
    const items = [...orderFormData.items];
    const nextValue = field === 'gst_rate' ? normalizeGstRateOption(value) : value;
    items[index][field] = nextValue;

    if (field === 'product_id') {
      const selectedProductId = String(value || '');
      const product = products.find(p => String(p.id) === selectedProductId);
      if (product) {
        const baseRate = toNumber(product.price);
        items[index].product_name = product.name;
        items[index].product_query = getProductSearchLabel(product);
        items[index].unit_price = baseRate;
        items[index].rate = baseRate;
        items[index].uom = product.uom || 'pcs';
        items[index].last_purchase_hint = '';
      } else {
        items[index].product_query = '';
        items[index].product_name = '';
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

          const suggestedRate = toNumber(suggestion.rate ?? suggestion.unit_price ?? current.rate ?? current.unit_price);
          const suggestedGst = normalizeGstRateOption(suggestion.gst_rate ?? current.gst_rate ?? 5);
          const suggestedDate = suggestion.created_at ? new Date(suggestion.created_at).toLocaleDateString() : '';
          const suggestedPo = suggestion.po_number || 'last PO';

          nextItems[index] = {
            ...current,
            unit_price: suggestedRate,
            rate: suggestedRate,
            gst_rate: suggestedGst,
            uom: suggestion.uom || current.uom || 'pcs',
            last_purchase_hint: `Suggested from ${suggestedPo}${suggestedDate ? ` (${suggestedDate})` : ''}`,
          };
          return { ...prev, items: nextItems };
        });
      } catch (_) {
        // keep product defaults when suggestion API is unavailable
      }
      return;
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
    setOrderFormData({ distributor_id: '', distributor_name: '', expected_delivery: '', notes: '', items: [] });
    setEditingOrderId(null);
    setOrderEntryMode('detailed');
  };

  const openCreateOrderForm = () => {
    setError('');
    resetOrderForm();
    setShowOrderForm(true);
  };

  const closeOrderForm = () => {
    setShowOrderForm(false);
    resetOrderForm();
  };

  const handlePoModalResizeStart = (event) => {
    if (isMobile) return;
    if (!poModalRef.current) return;
    event.preventDefault();
    const rect = poModalRef.current.getBoundingClientRect();
    poModalResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
    document.body.classList.add('po-modal-resizing');
    setIsResizingPoModal(true);
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const selectedDistributor = distributors.find(d => String(d.id) === String(orderFormData.distributor_id) && d.status === 'active');
      if (!selectedDistributor) {
        setError('Please select a valid distributor');
        return;
      }

      const invalidTypedProducts = orderFormData.items.filter(item =>
        String(item.product_query || '').trim() && !item.product_id
      );
      if (invalidTypedProducts.length > 0) {
        setError('Please select valid products from suggestions for all typed product names');
        return;
      }

      const validItems = orderFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        return;
      }

      const calculatedItems = validItems.map(item => {
        const line = calculateOrderItem(item);
        return {
          ...item,
          quantity: line.quantity,
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
        notes: orderFormData.notes,
        subtotal: orderTotals.taxableValue,
        taxable_value: orderTotals.taxableValue,
        tax_amount: orderTotals.taxAmount,
        total_amount: orderTotals.totalAmount,
        grand_total: orderTotals.totalAmount,
        total: orderTotals.totalAmount,
        items: calculatedItems,
        created_by: user?.id
      };

      if (editingOrderId) {
        await purchaseOrdersApi.update(editingOrderId, payload);
      } else {
        await purchaseOrdersApi.create(payload);
      }

      closeOrderForm();
      await fetchOrders();
    } catch (err) {
      setError(err.message || (editingOrderId ? 'Failed to update purchase order' : 'Failed to create purchase order'));
    }
  };

  const handleEditOrder = async (orderId) => {
    try {
      setError('');
      const order = await purchaseOrdersApi.getById(orderId);
      if (!order || String(order.status || '').toLowerCase() !== 'pending') {
        setError('Only pending orders can be edited');
        return;
      }

      const mappedItems = (order.items || []).map(item => ({
        product_id: item.product_id ? String(item.product_id) : '',
        product_query: item.product_name || '',
        product_name: item.product_name || '',
        quantity: toNumber(item.quantity),
        uom: item.uom || 'pcs',
        unit_price: toNumber(item.unit_price ?? item.rate),
        rate: toNumber(item.rate ?? item.unit_price),
        gst_rate: normalizeGstRateOption(item.gst_rate),
        discount_type: item.discount_type === 'fixed' ? 'fixed' : 'percent',
        discount_value: toNumber(item.discount_value),
        last_purchase_hint: ''
      }));

      setOrderFormData({
        distributor_id: order.distributor_id ? String(order.distributor_id) : '',
        distributor_name: order.distributor_name || distributors.find(d => String(d.id) === String(order.distributor_id))?.name || '',
        expected_delivery: toDateInputValue(order.expected_delivery),
        notes: order.notes || '',
        items: mappedItems
      });
      setEditingOrderId(order.id);
      setShowOrderForm(true);
    } catch (err) {
      setError(err.message || 'Failed to load order for edit');
    }
  };

  const handleQuickOrderItemAdd = () => {
    setQuickOrderFormData(prev => ({
      ...prev,
      items: [...prev.items, {
        product_id: '',
        product_query: '',
        product_name: '',
        quantity: 1,
        uom: 'pcs'
      }]
    }));
  };

  const handleQuickOrderItemRemove = (index) => {
    setQuickOrderFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleQuickOrderItemChange = (index, field, value) => {
    const items = [...quickOrderFormData.items];
    items[index][field] = value;

    if (field === 'product_id') {
      const selectedProductId = String(value || '');
      const product = products.find(p => String(p.id) === selectedProductId);
      if (product) {
        items[index].product_name = product.name;
        items[index].product_query = getProductSearchLabel(product);
        items[index].uom = product.uom || 'pcs';
      } else {
        items[index].product_query = '';
        items[index].product_name = '';
      }
    }

    setQuickOrderFormData(prev => ({ ...prev, items }));
  };

  const handleQuickOrderProductInputChange = (index, value) => {
    const items = [...quickOrderFormData.items];
    items[index].product_query = value;
    const match = resolveProductByInput(value);
    if (!match) {
      items[index].product_id = '';
      items[index].product_name = value;
      setQuickOrderFormData(prev => ({ ...prev, items }));
      return;
    }
    setQuickOrderFormData(prev => ({ ...prev, items }));
    handleQuickOrderItemChange(index, 'product_id', String(match.id));
  };

  const closeQuickOrderForm = () => {
    setShowQuickOrderForm(false);
    setQuickOrderFormData(getDefaultQuickOrderFormData());
  };

  const handleQuickOrderSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const selectedDistributor = distributors.find(d => String(d.id) === String(quickOrderFormData.distributor_id) && d.status === 'active');
      if (!selectedDistributor) {
        setError('Please select a valid distributor');
        return;
      }

      const invalidTypedProducts = quickOrderFormData.items.filter(item =>
        String(item.product_query || '').trim() && !item.product_id
      );
      if (invalidTypedProducts.length > 0) {
        setError('Please select valid products from suggestions for all typed product names');
        return;
      }

      const validItems = quickOrderFormData.items.filter(item => item.product_id && toNumber(item.quantity) > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        return;
      }

      const mappedItems = validItems.map(item => ({
        product_id: Number(item.product_id),
        product_name: item.product_name,
        quantity: toNumber(item.quantity),
        uom: item.uom || 'pcs',
        unit_price: 0,
        rate: 0,
        gst_rate: 0,
        discount_type: 'percent',
        discount_value: 0,
        taxable_value: 0,
        tax_amount: 0,
        line_total: 0
      }));

      await purchaseOrdersApi.create({
        distributor_id: Number(quickOrderFormData.distributor_id),
        expected_delivery: quickOrderFormData.order_date,
        notes: quickOrderFormData.notes || 'Quick entry draft',
        subtotal: 0,
        taxable_value: 0,
        tax_amount: 0,
        total_amount: 0,
        grand_total: 0,
        total: 0,
        items: mappedItems,
        created_by: user?.id
      });

      closeQuickOrderForm();
      await fetchOrders();
    } catch (err) {
      setError(err.message || 'Failed to create quick purchase order');
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
    setError('');

    try {
      const validItems = receiveData.items.filter(item => item.received_quantity > 0);
      if (validItems.length === 0) {
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
    }
  };

  // Status update
  const handleUpdateStatus = async (orderId, status) => {
    try {
      setError('');
      let order = purchaseOrders.find(po => String(po.id) === String(orderId));
      let billNumber = '';

      if (status === 'confirmed') {
        const existingBill = String(order?.bill_number || order?.invoice_number || '').trim();
        const inputValue = window.prompt('Enter Bill No (optional). Leave blank to continue.', existingBill);
        if (inputValue === null) return;
        billNumber = String(inputValue).trim();
      }

      const statusResult = await purchaseOrdersApi.updateStatus(orderId, status, billNumber ? { bill_number: billNumber } : {});
      if (status === 'confirmed' && Number(statusResult?.cap_applied_count || 0) > 0) {
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
      if (status === 'confirmed') {
        try {
          const detailedOrder = await purchaseOrdersApi.getById(orderId);
          if (detailedOrder) {
            order = detailedOrder;
          }
        } catch (detailErr) {
          // keep list-order fallback
        }
        if (order) {
          try {
            await createAutoDistributorCredit({
              distributorId: order.distributor_id,
              amount: calculateOrderBalanceAmount(order),
              poNumber: order.po_number,
              orderId: order.id,
              billNumber: billNumber || order.bill_number || order.invoice_number || ''
            });
          } catch (ledgerErr) {
            console.warn('Auto distributor credit entry failed on confirmation:', ledgerErr);
          }
        }
      }
      fetchOrders();
      fetchDistributorLedger();
    } catch (err) {
      setError(err?.message || 'Failed to update status');
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

  // View order details
  const handleViewOrder = async (orderId) => {
    try {
      setShowOrderDetail(true);
      setOrderDetail(null);
      setOrderDetailLoading(true);
      const order = await purchaseOrdersApi.getById(orderId);
      setOrderDetail(order);
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
    setShowReturnForm(true);
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
        items[index].product_name = product.name;
        items[index].unit_price = product.price;
        items[index].uom = product.uom || 'pcs';
      }
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
    setError('');

    try {
      const validItems = returnFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        return;
      }

      await purchaseReturnsApi.create({
        distributor_id: returnFormData.distributor_id,
        reference_po: returnFormData.reference_po,
        return_type: returnFormData.return_type,
        reason: returnFormData.reason,
        items: validItems,
        created_by: user?.id
      });

      setShowReturnForm(false);
      setReturnFormData({ distributor_id: '', reference_po: '', return_type: 'return', reason: '', items: [] });
      fetchReturns();
    } catch (err) {
      setError(err.message || 'Failed to create return');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { label: 'Pending', class: 'pending' },
      confirmed: { label: 'Confirmed', class: 'confirmed' },
      shipped: { label: 'Shipped', class: 'shipped' },
      received: { label: 'Received', class: 'received' },
      cancelled: { label: 'Cancelled', class: 'cancelled' }
    };
    const config = statusConfig[status] || { label: status, class: '' };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const getDistributorPhoneFromContacts = (contacts) => {
    if (!contacts) return '';
    if (typeof contacts === 'object' && contacts.phone) return String(contacts.phone);
    const raw = String(contacts).trim();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.phone || '');
    } catch (_) {
      return '';
    }
  };

  const getOrderDistributorInfo = (order) => {
    if (!order) return { name: '-', phone: '-', address: '-', contacts: '' };
    const distributor = distributors.find((d) => String(d.id) === String(order.distributor_id));
    const contacts = order.distributor_contacts || distributor?.contacts || '';
    const phoneFromContacts = getDistributorPhoneFromContacts(contacts);
    return {
      name: order.distributor_name || distributor?.name || '-',
      phone: order.distributor_phone || distributor?.phone || phoneFromContacts || '-',
      address: order.distributor_address || distributor?.address || '-',
      contacts
    };
  };

  const getItemFinancials = (item) => {
    const quantity = toNumber(item?.quantity);
    const rate = toNumber(item?.rate ?? item?.unit_price);
    const fallbackLine = quantity * rate;
    const taxableValue = toNumber(item?.taxable_value);
    const taxAmount = toNumber(item?.tax_amount);
    const lineTotal = toNumber(item?.line_total ?? item?.total ?? (taxableValue + taxAmount) ?? fallbackLine);
    const resolvedTaxable = taxableValue > 0 ? taxableValue : (taxAmount > 0 ? Math.max(0, lineTotal - taxAmount) : lineTotal);
    const gstRate = toNumber(item?.gst_rate);
    return {
      quantity,
      rate,
      taxableValue: resolvedTaxable,
      taxAmount,
      lineTotal: lineTotal > 0 ? lineTotal : fallbackLine,
      gstRate
    };
  };

  const buildPurchaseOrderPrintHtml = (order) => {
    const items = Array.isArray(order?.items) ? order.items : [];
    const supplier = getOrderDistributorInfo(order);
    const rows = items.map((item, index) => {
      const line = getItemFinancials(item);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item?.product_name || '-')}</td>
          <td>${line.quantity}</td>
          <td>${escapeHtml(item?.uom || '-')}</td>
          <td>${formatCurrency(line.rate)}</td>
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
            <div><strong>Status:</strong> ${String(order?.status || '-').toUpperCase()}</div>
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
  };
  const handleOpenPoCorrectionForm = async (order) => {
    if (!order || !order.distributor_id) {
      setError('Cannot open correction form. Invalid purchase order/distributor.');
      return;
    }

    try {
      setError('');
      setPoCorrectionSubmitting(true);

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

    const amount = toNumber(poCorrectionFormData.amount);
    const reason = String(poCorrectionFormData.reason || '').trim();
    if (amount <= 0) {
      setError('Correction amount must be greater than 0');
      return;
    }
    if (!reason) {
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
    }
  };

  const handleOpenLedgerForm = () => {
    setLedgerFormData({
      ...getDefaultLedgerFormData(),
      distributor_id: filters.distributor_id || ''
    });
    setShowLedgerForm(true);
  };

  const handleLedgerSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const amount = toNumber(ledgerFormData.amount);
    if (!ledgerFormData.distributor_id) {
      setError('Please select a distributor for ledger entry');
      return;
    }
    if (amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
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

      setShowLedgerForm(false);
      setLedgerFormData(getDefaultLedgerFormData());
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
      addLocalLedgerEntry(localEntry);
      setShowLedgerForm(false);
      setLedgerFormData(getDefaultLedgerFormData());
      fetchDistributorLedger();
    }
  };

  const orderTotals = calculateOrderTotals(orderFormData.items);
  const ledgerBalanceSummary = getLedgerBalanceSummary(ledgerRecords, filters.distributor_id);
  const orderProductOptions = useMemo(
    () => getDistributorProductOptions(orderFormData.distributor_id),
    [orderFormData.distributor_id, purchaseOrders, products]
  );
  const quickOrderProductOptions = useMemo(
    () => getDistributorProductOptions(quickOrderFormData.distributor_id),
    [quickOrderFormData.distributor_id, purchaseOrders, products]
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

      {/* Sub Navigation */}
      <div className="sub-nav">
        <button
          className={activeSubTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveSubTab('orders')}
        >
          <Package size={18} /> Purchase Orders
        </button>
        <button
          className={activeSubTab === 'returns' ? 'active' : ''}
          onClick={() => { setActiveSubTab('returns'); fetchReturns(); }}
        >
          <RotateCcw size={18} /> Purchase Returns
        </button>
      </div>

      {activeSubTab === 'orders' && (
        <>
          {/* Filters */}
          <div className="filters-bar">
            <div className="filter-group">
              <label>Distributor:</label>
              <select name="distributor_id" value={filters.distributor_id} onChange={handleFilterChange}>
                <option value="">All Distributors</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Status:</label>
              <select name="status" value={filters.status} onChange={handleFilterChange}>
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="shipped">Shipped</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="filter-group">
              <label>From:</label>
              <input type="date" name="start_date" value={filters.start_date} onChange={handleFilterChange} />
            </div>
            <div className="filter-group">
              <label>To:</label>
              <input type="date" name="end_date" value={filters.end_date} onChange={handleFilterChange} />
            </div>
          </div>

          {/* Actions Bar */}
          <div className="actions-bar">
            <h2>Purchase Orders</h2>
            <div className="action-buttons">
              <button className="admin-btn secondary" onClick={handleOpenLedgerForm}>
                <Plus size={18} /> Payment / Credit Entry
              </button>
              <button className="admin-btn secondary" onClick={handleReturnFormOpen}>
                <RotateCcw size={18} /> Return / Exchange
              </button>
              <button className="admin-btn primary" onClick={openCreateOrderForm}>
                <Plus size={18} /> New Order
              </button>
            </div>
          </div>

          {/* Orders Table */}
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Distributor</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Expected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No purchase orders found</td>
                  </tr>
                ) : (
                  purchaseOrders.map(order => (
                    <tr key={order.id}>
                      <td><strong>{order.po_number}</strong></td>
                      <td>{order.distributor_name}</td>
                      <td>{order.items?.length || 0}</td>
                      <td>{formatCurrency(getOrderDisplayTotal(order))}</td>
                      <td>{getStatusBadge(order.status)}</td>
                      <td>{order.expected_delivery ? new Date(order.expected_delivery).toLocaleDateString() : '-'}</td>
                       <td className="actions-cell">
                         <button className="action-btn view" title="View Details" onClick={() => handleViewOrder(order.id)}>
                           <Eye size={16} />
                         </button>
                         {order.status === 'pending' && (
                           <>
                             <button className="action-btn edit" title="Edit" onClick={() => handleEditOrder(order.id)}>
                               <Edit size={16} />
                             </button>
                             <button className="action-btn" title="Confirm" onClick={() => handleUpdateStatus(order.id, 'confirmed')}>
                               <Check size={16} />
                             </button>
                             {/*<button className="action-btn" title="Ship" onClick={() => handleUpdateStatus(order.id, 'shipped')}>
                               <Truck size={16} />
                             </button>*/}
                           </>
                         )}
                        {order.status === 'shipped' && (
                          <button className="action-btn receive" title="Receive" onClick={() => handleReceiveClick(order)}>
                            <Package size={16} />
                          </button>
                        )}
                        {order.status === 'confirmed' && (
                          <button
                            className="action-btn correction"
                            title="Correct Ledger Impact"
                            onClick={() => handleOpenPoCorrectionForm(order)}
                            disabled={poCorrectionSubmitting}
                          >
                            <ArrowUpDown size={16} />
                          </button>
                        )}
                        {order.status === 'pending' && (
                          <button className="action-btn delete" title="Delete" onClick={() => handleDeleteOrder(order.id)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Distributor Ledger */}
          <div className="actions-bar ledger-header">
            <h2>Distributor Credit / Payment Ledger</h2>
          </div>
          <div className="ledger-balance-summary">
            <span className="ledger-balance-label">{ledgerBalanceSummary.label}</span>
            <strong className={`ledger-balance-value ${ledgerBalanceSummary.value >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(ledgerBalanceSummary.value)}
            </strong>
          </div>
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Distributor</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th>Bill No</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {ledgerLoading ? (
                  <tr>
                    <td colSpan="9" className="empty-state">Loading ledger records...</td>
                  </tr>
                ) : ledgerRecords.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-state">No distributor payment/credit records found</td>
                  </tr>
                ) : (
                  ledgerRecords.map((entry, index) => (
                    <tr key={entry.id || index}>
                      <td>{new Date(entry.created_at || entry.transaction_date || Date.now()).toLocaleDateString()}</td>
                      <td>{getDistributorName(entry)}</td>
                      <td>{getLedgerTypeLabel(entry)}</td>
                      <td>{formatCurrency(toNumber(entry.amount))}</td>
                      <td>{getEntryDisplayBalance(entry) === null ? '-' : formatCurrency(getEntryDisplayBalance(entry))}</td>
                      <td>{entry.payment_mode || entry.method || '-'}</td>
                      <td>{entry.reference || entry.po_number || '-'}</td>
                      <td>{getLedgerBillNumber(entry)}</td>
                      <td>{entry.description || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeSubTab === 'returns' && (
        <>
          {/* Filters for Returns */}
          <div className="filters-bar">
            <div className="filter-group">
              <label>Distributor:</label>
              <select name="distributor_id" value={filters.distributor_id} onChange={handleFilterChange}>
                <option value="">All Distributors</option>
                {distributors.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Returns Table */}
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Return Number</th>
                  <th>Distributor</th>
                  <th>Type</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Reason</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {purchaseReturns.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-state">No purchase returns found</td>
                  </tr>
                ) : (
                  purchaseReturns.map(ret => (
                    <tr key={ret.id}>
                      <td><strong>{ret.return_number}</strong></td>
                      <td>{ret.distributor_name}</td>
                      <td>
                        <span className={`type-badge ${ret.return_type}`}>
                          {ret.return_type === 'exchange' ? 'Exchange' : 'Return'}
                        </span>
                      </td>
                      <td>{ret.items?.length || 0}</td>
                      <td>{formatCurrency(ret.total)}</td>
                      <td>{ret.reason || '-'}</td>
                      <td>{new Date(ret.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Quick Entry Modal */}
      {showQuickOrderForm && (
        <div className="modal-overlay" onClick={closeQuickOrderForm}>
          <div
            ref={poModalRef}
            className="modal-content large po-form-modal"
            onClick={e => e.stopPropagation()}
            style={isMobile ? undefined : { width: `${poModalSize.width}px`, height: `${poModalSize.height}px` }}
          >
            <div className="modal-header">
              <h2>Quick Purchase Entry</h2>
              <button className="close-btn" onClick={closeQuickOrderForm}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleQuickOrderSubmit} className="po-entry-form">
              <div className="form-section po-form-section po-form-header">
                <div className="form-row po-info-row">
                  <div className="form-group">
                    <label>Distributor *</label>
                    <input
                      type="text"
                      list="po-distributor-list-quick"
                      value={quickOrderFormData.distributor_name || ''}
                      onChange={e => handleQuickDistributorInputChange(e.target.value)}
                      placeholder="Type distributor name"
                      required
                    />
                    <datalist id="po-distributor-list-quick">
                      {distributors.filter(d => d.status === 'active').map(d => (
                        <option key={d.id} value={d.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={quickOrderFormData.order_date}
                      onChange={e => setQuickOrderFormData(prev => ({ ...prev, order_date: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={quickOrderFormData.notes}
                    onChange={e => setQuickOrderFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows="2"
                    placeholder="Optional short note"
                  />
                </div>
              </div>

              <div className="form-section po-form-section">
                <div className="section-header">
                  <h3>Items (Product + Qty)</h3>
                  <button type="button" className="add-item-btn" onClick={handleQuickOrderItemAdd}>
                    <Plus size={16} /> Add Row
                  </button>
                </div>
                <div className="quick-entry-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>UOM</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {quickOrderFormData.items.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="empty-state">No rows added</td>
                        </tr>
                      ) : quickOrderFormData.items.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <input
                              type="text"
                              list={`quick-po-product-list-${index}`}
                              value={item.product_query || ''}
                              onChange={e => handleQuickOrderProductInputChange(index, e.target.value)}
                              placeholder="Type product name / SKU"
                            />
                            <datalist id={`quick-po-product-list-${index}`}>
                              {quickOrderProductOptions.prioritized.map((p) => (
                                <option key={`quick-recent-${index}-${p.id}`} value={getProductSearchOptionLabel(p, 'recent')} />
                              ))}
                              {quickOrderProductOptions.all.map((p) => (
                                <option key={`quick-all-${index}-${p.id}`} value={getProductSearchOptionLabel(p, 'all')} />
                              ))}
                            </datalist>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => handleQuickOrderItemChange(index, 'quantity', toNumber(e.target.value))}
                            />
                          </td>
                          <td>
                            <input type="text" value={item.uom || 'pcs'} readOnly />
                          </td>
                          <td>
                            <button type="button" className="remove-item-btn" onClick={() => handleQuickOrderItemRemove(index)}>
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closeQuickOrderForm}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Save Quick Draft
                </button>
              </div>
            </form>
            {!isMobile && (
              <button
                type="button"
                className="po-modal-resize-handle"
                onMouseDown={handlePoModalResizeStart}
                aria-label="Resize purchase order form"
                title="Drag to resize"
              />
            )}
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {showOrderForm && (
        <div className="modal-overlay" onClick={closeOrderForm}>
          <div className="modal-content large po-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingOrderId ? 'Edit Purchase Order' : 'Create Purchase Order'}</h2>
              <button className="close-btn" onClick={closeOrderForm}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleOrderSubmit} className={`po-entry-form ${orderEntryMode === 'quick' ? 'quick-mode' : ''}`}>
              <div className="po-entry-mode-tabs" role="tablist" aria-label="Purchase entry mode">
                <button
                  type="button"
                  className={orderEntryMode === 'detailed' ? 'active' : ''}
                  onClick={() => setOrderEntryMode('detailed')}
                  role="tab"
                  aria-selected={orderEntryMode === 'detailed'}
                >
                  Detailed Entry
                </button>
                <button
                  type="button"
                  className={orderEntryMode === 'quick' ? 'active' : ''}
                  onClick={() => setOrderEntryMode('quick')}
                  role="tab"
                  aria-selected={orderEntryMode === 'quick'}
                >
                  Quick Entry
                </button>
              </div>
              <div className="form-section po-form-section po-form-header">
                <div className="form-row po-info-row">
                  <div className="form-group">
                    <label>Distributor *</label>
                    <input
                      type="text"
                      list="po-distributor-list"
                      value={orderFormData.distributor_name || ''}
                      onChange={e => handleDistributorInputChange(e.target.value)}
                      placeholder="Type distributor name"
                      required
                    />
                    <datalist id="po-distributor-list">
                      {distributors.filter(d => d.status === 'active').map(d => (
                        <option key={d.id} value={d.name} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>Expected Delivery</label>
                    <input
                      type="date"
                      value={orderFormData.expected_delivery}
                      onChange={e => setOrderFormData(prev => ({ ...prev, expected_delivery: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="form-row po-info-row">
                  <div className="form-group po-note-group">
                  <label>Notes</label>
                  <textarea
                    value={orderFormData.notes}
                    onChange={e => setOrderFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows="2"
                  />
                  </div>
                </div>
              </div>

              <div className="form-section po-form-section po-products-section">
                <div className="section-header">
                  <h3>Order Items</h3>
                </div>
                <div className="items-list">
                  {orderFormData.items.map((item, index) => {
                    const line = calculateOrderItem(item);
                    const netCostPerItem = line.quantity > 0 ? (line.totalAmount / line.quantity) : 0;
                    return (
                      <div key={index} className="item-row order-item-row po-item-row">
                        <div className="po-item-main">
                          <div className="item-field product">
                            <label>Product</label>
                            <input
                              type="text"
                              list={`po-product-list-${index}`}
                              value={item.product_query || ''}
                              onChange={e => handleOrderProductInputChange(index, e.target.value)}
                              placeholder="Type product name / SKU"
                            />
                            <datalist id={`po-product-list-${index}`}>
                              {orderProductOptions.prioritized.map((p) => (
                                <option key={`order-recent-${index}-${p.id}`} value={getProductSearchOptionLabel(p, 'recent')} />
                              ))}
                              {orderProductOptions.all.map((p) => (
                                <option key={`order-all-${index}-${p.id}`} value={getProductSearchOptionLabel(p, 'all')} />
                              ))}
                            </datalist>
                            {item.last_purchase_hint && (
                              <small className="field-hint">{item.last_purchase_hint}</small>
                            )}
                          </div>
                          <div className="item-field qty">
                            <label>Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => handleOrderItemChange(index, 'quantity', toNumber(e.target.value))}
                            />
                          </div>
                          <div className="item-field uom">
                            <label>UOM</label>
                            <input type="text" value={item.uom} readOnly />
                          </div>
                          {orderEntryMode !== 'quick' && (
                            <>
                              <div className="item-field price">
                                <label>Rate</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.rate ?? item.unit_price}
                                  onChange={e => handleOrderItemChange(index, 'rate', toNumber(e.target.value))}
                                />
                              </div>
                              <div className="item-field gst">
                                <label>GST %</label>
                                <select
                                  value={normalizeGstRateOption(item.gst_rate)}
                                  onChange={e => handleOrderItemChange(index, 'gst_rate', toNumber(e.target.value))}
                                >
                                  {GST_RATE_OPTIONS.map((rate) => (
                                    <option key={`gst-${rate}`} value={rate}>
                                      {rate}%
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </>
                          )}
                        </div>

                        {orderEntryMode !== 'quick' && (
                          <div className="po-item-discount">
                            <div className="item-field discount-type">
                              <label>Discount Type</label>
                              <select
                                value={item.discount_type || 'percent'}
                                onChange={e => handleOrderItemChange(index, 'discount_type', e.target.value)}
                              >
                                <option value="percent">%</option>
                                <option value="fixed">Fixed</option>
                              </select>
                            </div>
                            <div className="item-field discount-value">
                              <label>Discount</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.discount_value ?? 0}
                                onChange={e => handleOrderItemChange(index, 'discount_value', toNumber(e.target.value))}
                              />
                            </div>
                          </div>
                        )}

                        <div className="po-item-amounts">
                          <div className="item-field cost-per-item">
                            <label>Cost Per Item (After Discount + Tax)</label>
                            <span>{formatCurrency(netCostPerItem)}</span>
                          </div>
                          <div className="item-field taxable">
                            <label>Taxable Value</label>
                            <span>{formatCurrency(line.taxableValue)}</span>
                          </div>
                          <div className="item-field tax">
                            <label>Tax</label>
                            <span>{formatCurrency(line.taxAmount)}</span>
                          </div>
                          <div className="item-field total">
                            <label>Total Amount</label>
                            <span>{formatCurrency(line.totalAmount)}</span>
                          </div>
                        </div>

                        <button type="button" className="remove-item-btn po-remove-btn" onClick={() => handleOrderItemRemove(index)}>
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                  {orderFormData.items.length === 0 && (
                    <p className="no-items">No items added. Click "Add Item" to add products.</p>
                  )}
                </div>
                <div className="po-products-actions">
                  <button type="button" className="add-item-btn" onClick={handleOrderItemAdd}>
                    <Plus size={16} /> Add Item
                  </button>
                </div>
              </div>

              <div className="form-section po-form-section po-form-footer">
                <div className="order-summary">
                  <div className="summary-row">
                    <span>Total Taxable Value</span>
                    <strong>{formatCurrency(orderTotals.taxableValue)}</strong>
                  </div>
                  <div className="summary-row">
                    <span>Total Tax</span>
                    <strong>{formatCurrency(orderTotals.taxAmount)}</strong>
                  </div>
                  <div className="summary-row grand-total">
                    <span>Total Amount</span>
                    <strong>{formatCurrency(orderTotals.totalAmount)}</strong>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeOrderForm}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn">
                    {editingOrderId ? 'Update Order' : 'Create Order'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showReceiveModal && selectedOrder && (
        isMobile ? (
          <MobileBottomSheet
            open
            onClose={() => setShowReceiveModal(false)}
            title={`Receive Inventory - ${selectedOrder.po_number}`}
            className="purchase-receive-sheet"
            actions={(
              <>
                <button type="button" className="cancel-btn" onClick={() => setShowReceiveModal(false)}>
                  Cancel
                </button>
                <button type="submit" form="receive-inventory-form" className="submit-btn">
                  Confirm Receipt
                </button>
              </>
            )}
          >
            <form id="receive-inventory-form" onSubmit={handleReceiveSubmit} className="mobile-receive-form">
              <div className="form-section">
                <div className="form-group">
                  <label>Invoice Number</label>
                  <input
                    type="text"
                    value={receiveData.invoice_number}
                    onChange={e => setReceiveData(prev => ({ ...prev, invoice_number: e.target.value }))}
                    placeholder="Enter invoice number"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Received Items</h3>
                <div className="mobile-receive-list">
                  {receiveData.items.map((item, index) => (
                    <div key={index} className="mobile-receive-item">
                      <div className="mobile-receive-row">
                        <strong>{item.product_name}</strong>
                        <span>Ordered: {item.ordered_quantity}</span>
                      </div>
                      <div className="mobile-receive-stepper">
                        <button
                          type="button"
                          className="mobile-stepper-btn"
                          onClick={() => handleReceiveQtyStep(index, -1)}
                          aria-label="Decrease received quantity"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          max={item.ordered_quantity}
                          value={item.received_quantity}
                          onChange={e => handleReceiveItemChange(index, 'received_quantity', Math.max(0, Math.min(toNumber(item.ordered_quantity), toNumber(e.target.value))))}
                        />
                        <button
                          type="button"
                          className="mobile-stepper-btn"
                          onClick={() => handleReceiveQtyStep(index, 1)}
                          aria-label="Increase received quantity"
                        >
                          +
                        </button>
                      </div>
                      <div className="mobile-receive-row">
                        <label>Unit Cost</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={e => handleReceiveItemChange(index, 'unit_price', toNumber(e.target.value))}
                        />
                      </div>
                      <div className="mobile-receive-row value">
                        <span>Value</span>
                        <strong>{formatCurrency(toNumber(item.received_quantity) * toNumber(item.unit_price))}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </form>
          </MobileBottomSheet>
        ) : (
          <div className="modal-overlay" onClick={() => setShowReceiveModal(false)}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Receive Inventory - {selectedOrder.po_number}</h2>
                <button className="close-btn" onClick={() => setShowReceiveModal(false)}>
                  <X size={24} />
                </button>
              </div>
              <form id="receive-inventory-form" onSubmit={handleReceiveSubmit}>
                <div className="form-section">
                  <div className="form-group">
                    <label>Invoice Number</label>
                    <input
                      type="text"
                      value={receiveData.invoice_number}
                      onChange={e => setReceiveData(prev => ({ ...prev, invoice_number: e.target.value }))}
                      placeholder="Enter invoice number"
                    />
                  </div>
                </div>

                <div className="form-section">
                  <h3>Received Items</h3>
                  <div className="items-list">
                    {receiveData.items.map((item, index) => (
                      <div key={index} className="item-row">
                        <div className="item-field product">
                          <label>Product</label>
                          <span>{item.product_name}</span>
                        </div>
                        <div className="item-field qty">
                          <label>Ordered</label>
                          <span>{item.ordered_quantity}</span>
                        </div>
                        <div className="item-field qty">
                          <label>Received</label>
                          <input
                            type="number"
                            min="0"
                            max={item.ordered_quantity}
                            value={item.received_quantity}
                            onChange={e => handleReceiveItemChange(index, 'received_quantity', toNumber(e.target.value))}
                          />
                        </div>
                        <div className="item-field price">
                          <label>Unit Cost</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={e => handleReceiveItemChange(index, 'unit_price', toNumber(e.target.value))}
                          />
                        </div>
                        <div className="item-field total">
                          <label>Value</label>
                          <span>{formatCurrency(toNumber(item.received_quantity) * toNumber(item.unit_price))}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={() => setShowReceiveModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn">
                    Confirm Receipt
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      )}

      {/* Order Detail Modal */}
      {showOrderDetail && (
        <div className="modal-overlay" onClick={() => setShowOrderDetail(false)}>
          <div className="modal-content large po-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Purchase Order: {orderDetail?.po_number || '-'}</h2>
              <button className="close-btn" onClick={() => setShowOrderDetail(false)}>
                <X size={24} />
              </button>
            </div>
            {orderDetailLoading || !orderDetail ? (
              <div className="order-detail-body">
                <div className="loading">Loading purchase order details...</div>
              </div>
            ) : (
              <div className="order-detail-body">
              <div className="po-invoice-preview">
                {(() => {
                  const supplier = getOrderDistributorInfo(orderDetail);
                  return (
                    <>
                <div className="po-invoice-header">
                  <div>
                    <h3>Purchase Order</h3>
                    <p>PO #{orderDetail.po_number}</p>
                  </div>
                  <div className="po-invoice-meta">
                    <div><span>Status</span><strong>{String(orderDetail.status || '-').toUpperCase()}</strong></div>
                    <div><span>Created</span><strong>{formatDateTime(orderDetail.created_at || orderDetail.order_date)}</strong></div>
                    <div><span>Expected</span><strong>{formatDate(orderDetail.expected_delivery)}</strong></div>
                    <div><span>Bill No</span><strong>{orderDetail.bill_number || orderDetail.invoice_number || '-'}</strong></div>
                  </div>
                </div>

                <div className="po-party-grid">
                  <div className="po-party-card">
                    <h4>Supplier</h4>
                    <p>{supplier.name}</p>
                    <p>{supplier.phone}</p>
                    <p>{supplier.address}</p>
                  </div>
                  <div className="po-party-card">
                    <h4>Notes</h4>
                    <p>{orderDetail.notes || '-'}</p>
                  </div>
                </div>

                <table className="po-invoice-table">
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
                  <tbody>
                    {(orderDetail.items || []).map((item, idx) => {
                      const line = getItemFinancials(item);
                      return (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td>{item.product_name}</td>
                          <td>{line.quantity}</td>
                          <td>{item.uom || '-'}</td>
                          <td>{formatCurrency(line.rate)}</td>
                          <td>{line.gstRate.toFixed(2)}%</td>
                          <td>{formatCurrency(line.taxableValue)}</td>
                          <td>{formatCurrency(line.taxAmount)}</td>
                          <td>{formatCurrency(line.lineTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="po-invoice-summary">
                  <div className="po-summary-row">
                    <span>Taxable Value</span>
                    <strong>{formatCurrency(orderDetail.taxable_value || 0)}</strong>
                  </div>
                  <div className="po-summary-row">
                    <span>GST</span>
                    <strong>{formatCurrency(orderDetail.tax_amount || 0)}</strong>
                  </div>
                  <div className="po-summary-row grand">
                    <span>Grand Total</span>
                    <strong>{formatCurrency(orderDetail.total_amount || getOrderDisplayTotal(orderDetail))}</strong>
                  </div>
                </div>
                    </>
                  );
                })()}
              </div>
            </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="submit-btn print-po-btn"
                onClick={() => handlePrintOrderDetail(orderDetail)}
                disabled={!orderDetail}
              >
                <Printer size={16} /> Print
              </button>
              <button type="button" className="cancel-btn" onClick={() => setShowOrderDetail(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Distributor Ledger Modal */}
      {showLedgerForm && (
        <div className="modal-overlay" onClick={() => setShowLedgerForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add Distributor Payment / Credit</h2>
              <button className="close-btn" onClick={() => setShowLedgerForm(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleLedgerSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Distributor *</label>
                  <select
                    value={ledgerFormData.distributor_id}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                    required
                  >
                    <option value="">Select distributor</option>
                    {distributors.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Type *</label>
                  <select
                    value={ledgerFormData.type}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="payment">Payment (Reduce due)</option>
                    <option value="credit">Credit (Increase due)</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={ledgerFormData.amount}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Payment Mode</label>
                  <select
                    value={ledgerFormData.payment_mode}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, payment_mode: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Transaction Date</label>
                  <input
                    type="date"
                    value={ledgerFormData.transaction_date}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, transaction_date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Reference</label>
                  <input
                    type="text"
                    value={ledgerFormData.reference}
                    onChange={e => setLedgerFormData(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="Invoice / PO / Bank ref"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  rows="2"
                  value={ledgerFormData.description}
                  onChange={e => setLedgerFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional notes"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowLedgerForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO Ledger Correction Modal */}
      {showPoCorrectionForm && selectedCorrectionOrder && (
        <div className="modal-overlay" onClick={closePoCorrectionForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Correct PO Ledger Impact</h2>
              <button className="close-btn" onClick={closePoCorrectionForm}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handlePoCorrectionSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>PO Number</label>
                  <input type="text" value={selectedCorrectionOrder.po_number || '-'} readOnly />
                </div>
                <div className="form-group">
                  <label>Distributor</label>
                  <input type="text" value={selectedCorrectionOrder.distributor_name || getDistributorName(selectedCorrectionOrder)} readOnly />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Expected PO Impact</label>
                  <input type="text" value={formatCurrency(poCorrectionContext.expectedAmount)} readOnly />
                </div>
                <div className="form-group">
                  <label>Current Ledger Impact</label>
                  <input type="text" value={formatCurrency(poCorrectionContext.currentImpact)} readOnly />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Adjustment Needed (Delta)</label>
                  <input type="text" value={formatCurrency(poCorrectionContext.delta)} readOnly />
                </div>
                <div className="form-group">
                  <label>Linked Entries</label>
                  <input type="text" value={String(poCorrectionContext.linkedEntries)} readOnly />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Correction Type *</label>
                  <select
                    value={poCorrectionFormData.type}
                    onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="payment">Payment (Reduce due)</option>
                    <option value="credit">Credit (Increase due)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={poCorrectionFormData.amount}
                    onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Mode</label>
                  <select
                    value={poCorrectionFormData.payment_mode}
                    onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={poCorrectionFormData.transaction_date}
                    onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Reference</label>
                  <input
                    type="text"
                    value={poCorrectionFormData.reference}
                    onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="PO number or correction reference"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Correction Reason *</label>
                <textarea
                  rows="3"
                  value={poCorrectionFormData.reason}
                  onChange={(e) => setPoCorrectionFormData((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="Explain why this correction is needed"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={closePoCorrectionForm} disabled={poCorrectionSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn" disabled={poCorrectionSubmitting}>
                  {poCorrectionSubmitting ? 'Posting...' : 'Post Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Form Modal */}
      {showReturnForm && (
        <div className="modal-overlay" onClick={() => setShowReturnForm(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Purchase Return / Exchange</h2>
              <button className="close-btn" onClick={() => setShowReturnForm(false)}>
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleReturnSubmit}>
              <div className="form-section">
                <div className="form-row">
                  <div className="form-group">
                    <label>Distributor *</label>
                    <select
                      value={returnFormData.distributor_id}
                      onChange={e => setReturnFormData(prev => ({ ...prev, distributor_id: e.target.value }))}
                      required
                    >
                      <option value="">Select distributor</option>
                      {distributors.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Reference PO</label>
                    <input
                      type="text"
                      value={returnFormData.reference_po}
                      onChange={e => setReturnFormData(prev => ({ ...prev, reference_po: e.target.value }))}
                      placeholder="Original PO number"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Return Type</label>
                    <select
                      value={returnFormData.return_type}
                      onChange={e => setReturnFormData(prev => ({ ...prev, return_type: e.target.value }))}
                    >
                      <option value="return">Return</option>
                      <option value="exchange">Exchange</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Reason</label>
                    <input
                      type="text"
                      value={returnFormData.reason}
                      onChange={e => setReturnFormData(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Reason for return/exchange"
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>Return Items</h3>
                  <button type="button" className="add-item-btn" onClick={handleReturnItemAdd}>
                    <Plus size={16} /> Add Item
                  </button>
                </div>
                <div className="items-list">
                  {returnFormData.items.map((item, index) => (
                    <div key={index} className="item-row">
                      <div className="item-field product">
                        <label>Product</label>
                        <select
                          value={item.product_id}
                          onChange={e => handleReturnItemChange(index, 'product_id', e.target.value)}
                        >
                          <option value="">Select product</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                          ))}
                        </select>
                      </div>
                      <div className="item-field qty">
                        <label>Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleReturnItemChange(index, 'quantity', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field uom">
                        <label>UOM</label>
                        <input type="text" value={item.uom} readOnly />
                      </div>
                      <div className="item-field price">
                        <label>Unit Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={e => handleReturnItemChange(index, 'unit_price', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field total">
                        <label>Total</label>
                        <span>{formatCurrency(item.quantity * item.unit_price)}</span>
                      </div>
                      <button type="button" className="remove-item-btn" onClick={() => handleReturnItemRemove(index)}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowReturnForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  Create Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PurchaseManagement;
