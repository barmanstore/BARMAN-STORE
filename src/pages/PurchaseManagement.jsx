import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Edit, Trash2, X, Search, Package, Truck, RotateCcw, Eye, Check, Clock, ArrowUpDown, Printer, DollarSign, MessageCircle, BellRing, Wallet, AlertTriangle, Sparkles, CheckCheck } from 'lucide-react';
import { createClientRequestId, purchaseOrdersApi, distributorsApi, productsApi, purchaseReturnsApi, stockLedgerApi, distributorLedgerApi } from '../services/api';
import { printHtmlDocument, escapeHtml } from '../utils/printService';
import { formatCurrency, formatDate } from '../utils/formatters';
import { getTodayDate, formatDateTime, toLocalDateKey } from '../utils/dateTime';
import { getLedgerEntryTimestamp, getLedgerTypeLabel, getSignedLedgerAmount, toNumber } from '../utils/ledger';
import useIsMobile from '../hooks/useIsMobile';
import MobileBottomSheet from '../components/mobile/MobileBottomSheet';
import ProductForm from './ProductForm';
import { PurchaseOrderFormModal, QuickPurchaseOrderModal } from './purchase/PurchaseEntryModals';
import {
  PurchaseDashboardSection,
  PurchaseOrdersSection,
  PurchasePaymentsSection,
  PurchaseRemindersSection,
  PurchaseReturnsSection,
  PurchaseSectionTabs,
} from './purchase/PurchaseWorkspaceSections';
import './PurchaseManagement.css';

const GST_RATE_OPTIONS = [0, 5, 18];
const normalizeUomToken = (value, fallback = 'pcs') =>
  String(value || fallback).trim().toLowerCase() || fallback;

const UNIT_FAMILY_BASE_BY_UNIT = Object.freeze({
  pcs: 'pcs',
  dozen: 'pcs',
  kg: 'kg',
  g: 'kg',
  l: 'l',
  ml: 'l',
});

const UNIT_FAMILY_MULTIPLIERS = Object.freeze({
  pcs: Object.freeze({ pcs: 1, dozen: 12 }),
  kg: Object.freeze({ kg: 1, g: 0.001 }),
  l: Object.freeze({ l: 1, ml: 0.001 }),
});

const getUomFamily = (baseUnit = 'pcs') => {
  const normalizedBase = normalizeUomToken(baseUnit, 'pcs');
  const familyBase = UNIT_FAMILY_BASE_BY_UNIT[normalizedBase];
  if (!familyBase) return null;
  const multipliers = UNIT_FAMILY_MULTIPLIERS[familyBase];
  if (!multipliers || !Number.isFinite(multipliers[normalizedBase])) return null;
  return {
    normalizedBase,
    multipliers,
  };
};

const getAllowedUnitsFromBaseUnit = (baseUnit = 'pcs') => {
  const family = getUomFamily(baseUnit);
  if (!family) return [];
  const allUnits = Object.keys(family.multipliers);
  return [family.normalizedBase, ...allUnits.filter((unit) => unit !== family.normalizedBase)];
};

const convertQtyBetweenFamilyUnits = (qty, fromUnit, toUnit, baseUnit = 'pcs') => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  const family = getUomFamily(baseUnit);
  if (!family) return null;
  const from = normalizeUomToken(fromUnit, family.normalizedBase);
  const to = normalizeUomToken(toUnit, family.normalizedBase);
  const fromMultiplier = family.multipliers[from];
  const toMultiplier = family.multipliers[to];
  if (!Number.isFinite(fromMultiplier) || !Number.isFinite(toMultiplier) || toMultiplier <= 0) {
    return null;
  }
  const qtyInCanonicalBase = numericQty * fromMultiplier;
  return qtyInCanonicalBase / toMultiplier;
};

const getProductUomProfile = (product = null) => {
  const sellingUnit = normalizeUomToken(product?.uom, 'pcs');
  const baseUnit = normalizeUomToken(product?.base_unit, sellingUnit);
  const conversionFactorRaw = Number(product?.conversion_factor ?? 1);
  const conversionFactor = Number.isFinite(conversionFactorRaw) && conversionFactorRaw > 0
    ? conversionFactorRaw
    : 1;
  return {
    sellingUnit,
    baseUnit,
    conversionFactor,
  };
};

const getAllowedPurchaseUnitsForProduct = (product = null) => {
  if (!product) return ['pcs'];
  const profile = getProductUomProfile(product);
  const familyUnits = getAllowedUnitsFromBaseUnit(profile.baseUnit);
  if (familyUnits.length) return familyUnits;
  if (profile.baseUnit === profile.sellingUnit) return [profile.baseUnit];
  return [...new Set([profile.baseUnit, profile.sellingUnit])];
};

const resolvePurchaseUnitForProduct = (product = null, unit = 'pcs') => {
  if (!product) return normalizeUomToken(unit, 'pcs');
  const allowedUnits = getAllowedPurchaseUnitsForProduct(product);
  const requestedUnit = normalizeUomToken(unit, allowedUnits[0] || 'pcs');
  return allowedUnits.includes(requestedUnit) ? requestedUnit : (allowedUnits[0] || requestedUnit);
};

const toBaseQtyForProduct = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  if (!product) return numericQty;
  const profile = getProductUomProfile(product);
  const resolvedUnit = resolvePurchaseUnitForProduct(product, unit);
  const familyConverted = convertQtyBetweenFamilyUnits(numericQty, resolvedUnit, profile.baseUnit, profile.baseUnit);
  if (familyConverted !== null) return familyConverted;
  if (resolvedUnit === profile.baseUnit) return numericQty;
  if (resolvedUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty / profile.conversionFactor;
  }
  return numericQty;
};

const findProductForItem = (products = [], item = {}) => {
  const productId = Number(item?.product_id || 0);
  if (productId > 0) {
    const byId = products.find((product) => Number(product?.id || 0) === productId);
    if (byId) return byId;
  }
  const nameKey = String(item?.product_name || '').trim().toLowerCase();
  if (!nameKey) return null;
  return products.find(
    (product) => String(product?.name || '').trim().toLowerCase() === nameKey
  ) || null;
};

const createEmptyOrderItem = () => ({
  product_id: '',
  product_query: '',
  product_name: '',
  quantity: 1,
  uom: 'pcs',
  unit_price: 0,
  rate: 0,
  gst_rate: 5,
  discount_type: 'percent',
  discount_value: 0,
  last_purchase_hint: '',
});

const createEmptyQuickOrderItem = () => ({
  product_id: '',
  product_query: '',
  product_name: '',
  quantity: 1,
  uom: 'pcs',
});

const mergeProductsById = (existingProducts = [], incomingProducts = []) => {
  const normalizedIncoming = Array.isArray(incomingProducts)
    ? incomingProducts.filter((product) => product && product.id !== undefined && product.id !== null)
    : [];
  if (!normalizedIncoming.length) return existingProducts;

  const incomingIds = new Set(normalizedIncoming.map((product) => String(product.id)));
  const preservedProducts = existingProducts.filter((product) => !incomingIds.has(String(product?.id)));
  return [...normalizedIncoming, ...preservedProducts];
};

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
  const getDefaultProcessFormData = () => ({
    bill_number: '',
    paid_amount: '',
    payment_mode: 'cash',
    payment_reference: '',
    payment_date: getTodayDate(),
    payment_notes: '',
  });
  const getDefaultPoPaymentFormData = () => ({
    amount: '',
    payment_mode: 'cash',
    reference: '',
    transaction_date: getTodayDate(),
    notes: '',
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

  const getPurchaseRequestErrorMessage = (err, fallbackMessage) => {
    const conflictType = String(err?.payload?.conflict_type || '').trim().toLowerCase();
    if (Number(err?.status || 0) === 409 && conflictType === 'purchase_order_duplicate') {
      const conflictPo = String(err?.payload?.conflict?.po_number || '').trim();
      return conflictPo
        ? `Duplicate prevented. Matching purchase order already exists: ${conflictPo}. Open or edit that PO instead of creating another one.`
        : 'Duplicate prevented. A matching purchase order already exists for the same distributor, planned date, and item basket.';
    }
    return err?.message || fallbackMessage;
  };

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
  const normalizePoLifecycleStatus = (status) => {
    const raw = String(status || '').trim().toLowerCase();
    if (!raw) return 'prepared';
    if (raw === 'prepared' || raw === 'registered' || raw === 'pending' || raw === 'draft') return 'prepared';
    if (raw === 'sent') return 'sent';
    if (raw === 'revised' || raw === 'edited') return 'revised';
    if (raw === 'confirmed' || raw === 'processed' || raw === 'received' || raw === 'shipped') return 'confirmed';
    if (raw === 'part_paid' || raw === 'partial_paid') return 'part_paid';
    if (raw === 'fully_paid' || raw === 'full_paid' || raw === 'paid') return 'fully_paid';
    if (raw === 'closed') return 'closed';
    if (raw === 'cancelled' || raw === 'canceled') return 'cancelled';
    return 'prepared';
  };
  const normalizePoPaymentStatus = (status) => {
    const raw = String(status || '').trim().toLowerCase();
    if (!raw) return 'unpaid';
    if (raw === 'paid') return 'paid';
    if (raw === 'part_paid' || raw === 'partpaid' || raw === 'partial') return 'part_paid';
    if (raw === 'pending') return 'unpaid';
    if (raw === 'unpaid') return 'unpaid';
    return 'unpaid';
  };
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

  const getPoLifecycleStatus = (order) => normalizePoLifecycleStatus(order?.po_status || order?.status);
  const getPoPaymentStatus = (order) => normalizePoPaymentStatus(order?.payment_status);
  const getPoPaidAmount = (order) => Math.max(0, toNumber(order?.paid_amount));
  const getPoBalanceDue = (order) => {
    const explicitBalance = toNumber(order?.balance_due);
    if (explicitBalance > 0) return explicitBalance;
    const total = Math.max(0, getOrderDisplayTotal(order));
    const paid = Math.min(total, getPoPaidAmount(order));
    return Math.max(0, total - paid);
  };
  const isPoEditable = (order) => {
    const lifecycleStatus = getPoLifecycleStatus(order);
    return lifecycleStatus === 'prepared' || lifecycleStatus === 'sent' || lifecycleStatus === 'revised';
  };
  const canReceivePo = (order) => {
    const lifecycleStatus = getPoLifecycleStatus(order);
    return ['confirmed', 'part_paid', 'fully_paid'].includes(lifecycleStatus)
      && String(order?.status || '').trim().toLowerCase() !== 'received';
  };
  const canAddPaymentToPo = (order) => ['confirmed', 'part_paid', 'fully_paid'].includes(getPoLifecycleStatus(order));
  const canClosePo = (order) => getPoLifecycleStatus(order) === 'fully_paid' && getPoBalanceDue(order) <= 0;
  const getPoNextAction = (order) => {
    const lifecycleStatus = getPoLifecycleStatus(order);
    const paymentStatus = getPoPaymentStatus(order);
    const hasReceived = String(order?.status || '').trim().toLowerCase() === 'received'
      || (Array.isArray(order?.items) && order.items.length > 0 && order.items.every((item) => toNumber(item?.received_quantity) >= toNumber(item?.quantity)));
    if (lifecycleStatus === 'cancelled') return 'Cancelled';
    if (lifecycleStatus === 'closed') return 'Closed';
    if (lifecycleStatus === 'prepared') return 'Send to distributor';
    if (lifecycleStatus === 'sent' || lifecycleStatus === 'revised') return 'Confirm with bill';
    if (!hasReceived) return 'Receive delivery';
    if (paymentStatus !== 'paid' && getPoBalanceDue(order) > 0) return 'Collect payment';
    if (lifecycleStatus === 'fully_paid') return 'Close PO';
    return order?.next_action || 'Monitor';
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
    const validStatuses = new Set(['confirmed', 'received', 'shipped', 'processed', 'part_paid', 'fully_paid', 'closed']);
    const derived = (orders || [])
      .filter((order) => {
        const lifecycle = getPoLifecycleStatus(order);
        if (['confirmed', 'part_paid', 'fully_paid', 'closed'].includes(lifecycle)) return true;
        return validStatuses.has(String(order.status || '').toLowerCase());
      })
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
    const product = findProductForItem(products, item);
    const profile = getProductUomProfile(product);
    const quantity = Math.max(0, toNumber(item.quantity));
    const uom = resolvePurchaseUnitForProduct(product, item.uom || profile.baseUnit);
    const quantityInBase = toBaseQtyForProduct(quantity, uom, product);
    const rate = Math.max(0, toNumber(item.rate ?? item.unit_price));
    const grossAmount = quantityInBase * rate;
    const discountType = item.discount_type === 'fixed' ? 'fixed' : 'percent';
    const discountValue = Math.max(0, toNumber(item.discount_value));
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
      quantityInBase,
      uom,
      baseUnit: profile.baseUnit,
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

  const [activeSubTab, setActiveSubTab] = useState('dashboard');
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [quickOrderSubmitting, setQuickOrderSubmitting] = useState(false);
  const [orderFormClientRequestId, setOrderFormClientRequestId] = useState(() => createClientRequestId('po'));
  const [quickOrderFormClientRequestId, setQuickOrderFormClientRequestId] = useState(() => createClientRequestId('poquick'));
  const orderSubmitLockRef = useRef(false);
  const quickOrderSubmitLockRef = useRef(false);

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
  const [showQuickOrderForm, setShowQuickOrderForm] = useState(false);
  const [showPoProductForm, setShowPoProductForm] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [showPoCorrectionForm, setShowPoCorrectionForm] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [processSubmitting, setProcessSubmitting] = useState(false);
  const [sendingWhatsAppOrderId, setSendingWhatsAppOrderId] = useState(null);
  const [processingOrder, setProcessingOrder] = useState(null);
  const [processFormData, setProcessFormData] = useState(getDefaultProcessFormData());
  const [showPoPaymentModal, setShowPoPaymentModal] = useState(false);
  const [poPaymentSubmitting, setPoPaymentSubmitting] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [poPaymentFormData, setPoPaymentFormData] = useState(getDefaultPoPaymentFormData());
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [selectedCorrectionOrder, setSelectedCorrectionOrder] = useState(null);
  const [ledgerRecords, setLedgerRecords] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsSummary, setOperationsSummary] = useState({
    cards: {
      outstanding_amount: 0,
      payable_today_amount: 0,
      overdue_amount: 0,
      predicted_payment_today_amount: 0,
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
    reminders: [],
    payables: [],
    workflow: [],
    distributor_insights: [],
  });
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
  const [orderEntryMode, setOrderEntryMode] = useState('detailed');
  const [activePoProductField, setActivePoProductField] = useState({ mode: 'detailed', index: null });
  const [poProductFormTarget, setPoProductFormTarget] = useState(null);
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
    strict_due_date: '',
    strict_due_note: '',
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
    if (!success) return undefined;
    const timerId = window.setTimeout(() => setSuccess(''), 3200);
    return () => window.clearTimeout(timerId);
  }, [success]);

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
    if (activeSubTab === 'dashboard' || activeSubTab === 'payments' || activeSubTab === 'reminders') {
      fetchOperationsSummary();
    }
    if (activeSubTab === 'payments') {
      fetchDistributorLedger();
    }
    if (activeSubTab === 'returns') {
      fetchReturns();
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

  const fetchOperationsSummary = async () => {
    try {
      setOperationsLoading(true);
      const params = {};
      if (filters.distributor_id) params.distributor_id = filters.distributor_id;
      const summary = await purchaseOrdersApi.getOperationsSummary(params);
      setOperationsSummary(summary || {
        cards: {},
        today_distributors: [],
        tomorrow_distributors: [],
        weekly_distributors: [],
        predicted_payments_today: [],
        reminders: [],
        payables: [],
        workflow: [],
        distributor_insights: [],
      });
    } catch (err) {
      setOperationsSummary({
        cards: {
          outstanding_amount: 0,
          payable_today_amount: 0,
          overdue_amount: 0,
          predicted_payment_today_amount: 0,
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
        reminders: [],
        payables: [],
        workflow: [],
        distributor_insights: [],
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

  const ensureOrderFormItemAtIndex = (index) => {
    setOrderFormData((prev) => {
      const items = [...prev.items];
      while (items.length <= index) {
        items.push({ ...createEmptyOrderItem(), gst_rate: normalizeGstRateOption(5) });
      }
      return { ...prev, items };
    });
  };

  const ensureQuickOrderItemAtIndex = (index) => {
    setQuickOrderFormData((prev) => {
      const items = [...prev.items];
      while (items.length <= index) {
        items.push(createEmptyQuickOrderItem());
      }
      return { ...prev, items };
    });
  };

  const getTargetPoProductField = (mode = 'detailed') => {
    const items = mode === 'quick' ? quickOrderFormData.items : orderFormData.items;
    if (
      activePoProductField?.mode === mode &&
      Number.isInteger(activePoProductField?.index) &&
      activePoProductField.index >= 0
    ) {
      return activePoProductField;
    }
    const emptyIndex = items.findIndex(
      (item) => !String(item?.product_id || '').trim() && !String(item?.product_query || '').trim()
    );
    if (emptyIndex >= 0) {
      return { mode, index: emptyIndex };
    }
    return { mode, index: items.length };
  };

  const handleOrderProductFieldFocus = (index) => {
    setActivePoProductField({ mode: 'detailed', index });
  };

  const handleQuickProductFieldFocus = (index) => {
    setActivePoProductField({ mode: 'quick', index });
  };

  const handleOpenPoProductForm = (mode = 'detailed') => {
    const target = getTargetPoProductField(mode);
    if (mode === 'quick') {
      ensureQuickOrderItemAtIndex(target.index);
    } else {
      ensureOrderFormItemAtIndex(target.index);
    }
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

    if (target.mode === 'quick') {
      setQuickOrderFormData((prev) => {
        const items = [...prev.items];
        while (items.length <= target.index) {
          items.push(createEmptyQuickOrderItem());
        }
        const currentItem = items[target.index] || createEmptyQuickOrderItem();
        items[target.index] = {
          ...currentItem,
          product_id: String(product.id),
          product_name: String(product.name || '').trim(),
          product_query: getProductSearchLabel(product),
          uom: resolvePurchaseUnitForProduct(
            product,
            currentItem.uom || product.base_unit || product.uom || 'pcs'
          ),
        };
        return { ...prev, items };
      });
      return;
    }

    setOrderFormData((prev) => {
      const items = [...prev.items];
      while (items.length <= target.index) {
        items.push({ ...createEmptyOrderItem(), gst_rate: normalizeGstRateOption(5) });
      }
      const currentItem = items[target.index] || createEmptyOrderItem();
      const baseRate = toNumber(product.price);
      items[target.index] = {
        ...currentItem,
        product_id: String(product.id),
        product_name: String(product.name || '').trim(),
        product_query: getProductSearchLabel(product),
        unit_price: baseRate,
        rate: baseRate,
        uom: resolvePurchaseUnitForProduct(
          product,
          currentItem.uom || product.base_unit || product.uom || 'pcs'
        ),
        gst_rate: normalizeGstRateOption(currentItem.gst_rate ?? 5),
        last_purchase_hint: '',
      };
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
      items: [...prev.items, { ...createEmptyOrderItem(), gst_rate: normalizeGstRateOption(5) }]
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

  const handleOrderItemChange = async (index, field, value) => {
    const items = [...orderFormData.items];
    const nextValue = field === 'gst_rate' ? normalizeGstRateOption(value) : value;
    items[index][field] = nextValue;

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
    setOrderFormData({
      distributor_id: '',
      distributor_name: '',
      expected_delivery: '',
      strict_due_date: '',
      strict_due_note: '',
      notes: '',
      items: [],
    });
    setEditingOrderId(null);
    setOrderEntryMode('detailed');
    setOrderSubmitting(false);
    setActivePoProductField({ mode: 'detailed', index: null });
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
    setOrderEntryMode('quick');
    setOrderFormData({
      distributor_id: distributor ? String(distributor.id) : String(distributorId || ''),
      distributor_name: distributor?.name || '',
      expected_delivery: options.expected_delivery || options.order_date || '',
      strict_due_date: options.strict_due_date || '',
      strict_due_note: options.strict_due_note || '',
      notes: options.notes || '',
      items: suggestedItems.map((item) => {
        const product = products.find((entry) => String(entry.id) === String(item.product_id || '')) || null;
        const resolvedUom = resolvePurchaseUnitForProduct(product, item.uom || product?.base_unit || product?.uom || 'pcs');
        const rate = Math.max(0, toNumber(item.rate ?? item.unit_price));
        return {
          product_id: item.product_id ? String(item.product_id) : '',
          product_query: product ? getProductSearchLabel(product) : String(item.product_name || '').trim(),
          product_name: String(item.product_name || product?.name || '').trim(),
          quantity: Math.max(1, toNumber(item.quantity || 1)),
          uom: resolvedUom,
          unit_price: rate,
          rate,
          gst_rate: normalizeGstRateOption(item.gst_rate ?? 5),
          discount_type: item.discount_type === 'fixed' ? 'fixed' : 'percent',
          discount_value: Math.max(0, toNumber(item.discount_value || 0)),
          last_purchase_hint: 'Suggested from recent distributor history',
        };
      }),
    });
    setShowOrderForm(true);
  };

  const closeOrderForm = () => {
    closePoProductForm();
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
        return {
          product_id: item.product_id ? String(item.product_id) : '',
          product_query: item.product_name || '',
          product_name: item.product_name || '',
          quantity: toNumber(item.quantity),
          uom: resolvePurchaseUnitForProduct(product, item.uom || product?.base_unit || product?.uom || 'pcs'),
          unit_price: toNumber(item.unit_price ?? item.rate),
          rate: toNumber(item.rate ?? item.unit_price),
          gst_rate: normalizeGstRateOption(item.gst_rate),
          discount_type: item.discount_type === 'fixed' ? 'fixed' : 'percent',
          discount_value: toNumber(item.discount_value),
          last_purchase_hint: ''
        };
      });

      setOrderFormData({
        distributor_id: order.distributor_id ? String(order.distributor_id) : '',
        distributor_name: order.distributor_name || distributors.find(d => String(d.id) === String(order.distributor_id))?.name || '',
        expected_delivery: toDateInputValue(order.expected_delivery),
        strict_due_date: toDateInputValue(order.strict_due_date),
        strict_due_note: order.strict_due_note || '',
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
      items: [...prev.items, createEmptyQuickOrderItem()]
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
        const defaultUom = resolvePurchaseUnitForProduct(product, product.base_unit || product.uom || 'pcs');
        items[index].product_name = product.name;
        items[index].product_query = getProductSearchLabel(product);
        items[index].uom = defaultUom;
      } else {
        items[index].product_query = '';
        items[index].product_name = '';
        items[index].uom = 'pcs';
      }
    }

    if (field === 'uom') {
      const selectedProduct = findProductForItem(products, items[index]);
      items[index].uom = resolvePurchaseUnitForProduct(selectedProduct, value);
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
    closePoProductForm();
    setShowQuickOrderForm(false);
    setQuickOrderFormData(getDefaultQuickOrderFormData());
    setQuickOrderSubmitting(false);
    setActivePoProductField({ mode: 'quick', index: null });
    setPoProductFormTarget(null);
    quickOrderSubmitLockRef.current = false;
    setQuickOrderFormClientRequestId(createClientRequestId('poquick'));
  };

  const handleQuickOrderSubmit = async (e) => {
    e.preventDefault();
    if (quickOrderSubmitLockRef.current || quickOrderSubmitting) return;
    quickOrderSubmitLockRef.current = true;
    setError('');

    try {
      setQuickOrderSubmitting(true);
      const selectedDistributor = distributors.find(d => String(d.id) === String(quickOrderFormData.distributor_id) && d.status === 'active');
      if (!selectedDistributor) {
        setError('Please select a valid distributor');
        setQuickOrderSubmitting(false);
        quickOrderSubmitLockRef.current = false;
        return;
      }

      const invalidTypedProducts = quickOrderFormData.items.filter(item =>
        String(item.product_query || '').trim() && !item.product_id
      );
      if (invalidTypedProducts.length > 0) {
        setError('Please select valid products from suggestions for all typed product names');
        setQuickOrderSubmitting(false);
        quickOrderSubmitLockRef.current = false;
        return;
      }

      const validItems = quickOrderFormData.items.filter(item => item.product_id && toNumber(item.quantity) > 0);
      if (validItems.length === 0) {
        setError('Please add at least one item');
        setQuickOrderSubmitting(false);
        quickOrderSubmitLockRef.current = false;
        return;
      }

      const mappedItems = validItems.map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        return {
          product_id: Number(item.product_id),
          product_name: item.product_name,
          quantity: Math.max(0, toNumber(item.quantity)),
          uom: resolvePurchaseUnitForProduct(product, item.uom || product?.base_unit || product?.uom || 'pcs'),
          unit_price: 0,
          rate: 0,
          gst_rate: 0,
          discount_type: 'percent',
          discount_value: 0,
          taxable_value: 0,
          tax_amount: 0,
          line_total: 0
        };
      });

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
        created_by: user?.id,
        client_request_id: quickOrderFormClientRequestId,
      });

      closeQuickOrderForm();
      await fetchOrders();
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'Failed to create quick purchase order'));
      setQuickOrderSubmitting(false);
      quickOrderSubmitLockRef.current = false;
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
  };

  const handleProcessSubmit = async (e) => {
    e.preventDefault();
    if (!processingOrder) return;
    const billNumber = String(processFormData.bill_number || '').trim();
    if (!billNumber) {
      setError('Bill number is required to process PO');
      return;
    }
    const paidAmount = Math.max(0, toNumber(processFormData.paid_amount));
    const poTotal = Math.max(0, getOrderDisplayTotal(processingOrder));
    if (paidAmount > poTotal) {
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
  };

  const handlePoPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentOrder) return;
    const amount = Math.max(0, toNumber(poPaymentFormData.amount));
    const balanceDue = getPoBalanceDue(paymentOrder);
    if (amount <= 0) {
      setError('Payment amount must be greater than 0');
      return;
    }
    if (amount > balanceDue) {
      setError('Payment amount cannot exceed current balance due');
      return;
    }

    try {
      setError('');
      setPoPaymentSubmitting(true);
      await purchaseOrdersApi.addPayment(paymentOrder.id, {
        amount: Number(amount.toFixed(2)),
        payment_mode: poPaymentFormData.payment_mode,
        reference: poPaymentFormData.reference,
        transaction_date: poPaymentFormData.transaction_date || getTodayDate(),
        notes: poPaymentFormData.notes,
        created_by: user?.id,
      });
      closePoPaymentModal();
      fetchOrders();
      fetchDistributorLedger();
    } catch (err) {
      setError(err?.message || 'Failed to add PO payment');
      setPoPaymentSubmitting(false);
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
          product_name: item.product_name || '',
          quantity: Math.max(0, toNumber(item.quantity)),
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
        nextItem.quantity = Math.max(0, toNumber(value));
      }
      items[index] = nextItem;
      return { ...prev, items };
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
    setError('');

    try {
      const validItems = returnFormData.items.filter(item => item.product_id && item.quantity > 0);
      if (validItems.length === 0) {
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

      setShowReturnForm(false);
      setReturnFormData({ distributor_id: '', reference_po: '', return_type: 'return', reason: '', items: [] });
      fetchReturns();
    } catch (err) {
      setError(err.message || 'Failed to create return');
    }
  };

  const getStatusBadge = (order) => {
    const lifecycleStatus = getPoLifecycleStatus(order);
    const statusConfig = {
      prepared: { label: 'Prepared', class: 'registered' },
      sent: { label: 'Sent', class: 'shipped' },
      revised: { label: 'Revised', class: 'pending' },
      confirmed: { label: 'Confirmed', class: 'processed' },
      part_paid: { label: 'Part Paid', class: 'received' },
      fully_paid: { label: 'Fully Paid', class: 'received' },
      closed: { label: 'Closed', class: 'received' },
      cancelled: { label: 'Cancelled', class: 'cancelled' }
    };
    const config = statusConfig[lifecycleStatus] || { label: lifecycleStatus || '-', class: '' };
    return <span className={`status-badge ${config.class}`}>{config.label}</span>;
  };

  const getPoPaymentBadge = (order) => {
    const paymentStatus = getPoPaymentStatus(order);
    const paymentConfig = {
      unpaid: { label: 'Unpaid', class: 'unpaid' },
      part_paid: { label: 'Part Paid', class: 'part-paid' },
      paid: { label: 'Paid', class: 'paid' },
    };
    const config = paymentConfig[paymentStatus] || paymentConfig.unpaid;
    return <span className={`payment-status-badge ${config.class}`}>{config.label}</span>;
  };

  const getLedgerRowStatusClass = (entry) => {
    const rawLinkedStatus = entry?.linked_po_payment_status ?? entry?.po_payment_status;
    if (rawLinkedStatus === undefined || rawLinkedStatus === null || String(rawLinkedStatus).trim() === '') return '';
    const linkedStatus = normalizePoPaymentStatus(rawLinkedStatus);
    if (!linkedStatus) return '';
    if (linkedStatus === 'paid') return 'ledger-row-paid';
    if (linkedStatus === 'part_paid') return 'ledger-row-part-paid';
    if (linkedStatus === 'unpaid') return 'ledger-row-unpaid';
    return '';
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
    const supplier = getOrderDistributorInfo(order);
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
  ];
  const orderDetailSupplier = getOrderDistributorInfo(orderDetail);
  const orderDetailIsEditable = orderDetail ? isPoEditable(orderDetail) : false;
  const orderDetailItems = orderDetailEditMode ? (orderDetailDraft?.items || []) : (orderDetail?.items || []);
  const orderDetailComputedTotals = orderDetailEditMode
    ? calculateOrderTotals(orderDetailItems)
    : {
        taxableValue: toNumber(orderDetail?.taxable_value),
        taxAmount: toNumber(orderDetail?.tax_amount),
        totalAmount: toNumber(orderDetail?.total_amount || getOrderDisplayTotal(orderDetail)),
      };
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
          getStatusBadge={getStatusBadge}
          getPoPaymentBadge={getPoPaymentBadge}
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
          getLedgerRowStatusClass={getLedgerRowStatusClass}
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

      <QuickPurchaseOrderModal
        open={showQuickOrderForm}
        closeQuickOrderForm={closeQuickOrderForm}
        poModalRef={poModalRef}
        isMobile={isMobile}
        poModalSize={poModalSize}
        quickOrderFormData={quickOrderFormData}
        setQuickOrderFormData={setQuickOrderFormData}
        handleQuickOrderSubmit={handleQuickOrderSubmit}
        handleQuickDistributorInputChange={handleQuickDistributorInputChange}
        distributors={distributors}
        handleQuickOrderItemAdd={handleQuickOrderItemAdd}
        quickOrderProductOptions={quickOrderProductOptions}
        products={products}
        findProductForItem={findProductForItem}
        getAllowedPurchaseUnitsForProduct={getAllowedPurchaseUnitsForProduct}
        resolvePurchaseUnitForProduct={resolvePurchaseUnitForProduct}
        handleQuickOrderProductInputChange={handleQuickOrderProductInputChange}
        handleQuickProductFieldFocus={handleQuickProductFieldFocus}
        handleQuickOrderItemChange={handleQuickOrderItemChange}
        handleQuickOrderItemRemove={handleQuickOrderItemRemove}
        handleOpenProductForm={handleOpenPoProductForm}
        getProductSearchOptionLabel={getProductSearchOptionLabel}
        toNumber={toNumber}
        handlePoModalResizeStart={handlePoModalResizeStart}
        quickOrderSubmitting={quickOrderSubmitting}
      />

      <PurchaseOrderFormModal
        open={showOrderForm}
        closeOrderForm={closeOrderForm}
        editingOrderId={editingOrderId}
        handleOrderSubmit={handleOrderSubmit}
        orderEntryMode={orderEntryMode}
        setOrderEntryMode={setOrderEntryMode}
        orderFormData={orderFormData}
        setOrderFormData={setOrderFormData}
        handleDistributorInputChange={handleDistributorInputChange}
        distributors={distributors}
        orderProductOptions={orderProductOptions}
        products={products}
        findProductForItem={findProductForItem}
        calculateOrderItem={calculateOrderItem}
        getAllowedPurchaseUnitsForProduct={getAllowedPurchaseUnitsForProduct}
        handleOrderProductInputChange={handleOrderProductInputChange}
        handleOrderProductFieldFocus={handleOrderProductFieldFocus}
        handleOrderItemChange={handleOrderItemChange}
        GST_RATE_OPTIONS={GST_RATE_OPTIONS}
        toNumber={toNumber}
        handleOrderItemRemove={handleOrderItemRemove}
        handleOrderItemAdd={handleOrderItemAdd}
        handleOpenProductForm={handleOpenPoProductForm}
        orderTotals={orderTotals}
        getProductSearchOptionLabel={getProductSearchOptionLabel}
        orderSubmitting={orderSubmitting}
      />

      {showPoProductForm && (
        <ProductForm
          product={null}
          mode="quick"
          onClose={closePoProductForm}
          onSave={handlePoProductSave}
        />
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
        <div className="modal-overlay" onClick={closeOrderDetail}>
          <div className="modal-content large po-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Purchase Order: {orderDetail?.po_number || '-'}</h2>
              <button className="close-btn" onClick={closeOrderDetail}>
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
                <div className="po-invoice-header">
                  <div>
                    <h3>Purchase Order</h3>
                    <p>PO #{orderDetail.po_number}</p>
                  </div>
                  <div className="po-invoice-meta">
                    <div><span>PO Status</span><strong>{String(getPoLifecycleStatus(orderDetail) || '-').toUpperCase()}</strong></div>
                    <div><span>Payment</span><strong>{String(getPoPaymentStatus(orderDetail) || '-').toUpperCase()}</strong></div>
                    <div><span>Paid</span><strong>{formatCurrency(getPoPaidAmount(orderDetail))}</strong></div>
                    <div><span>Balance</span><strong>{formatCurrency(getPoBalanceDue(orderDetail))}</strong></div>
                    <div><span>Created</span><strong>{formatDateTime(orderDetail.created_at || orderDetail.order_date)}</strong></div>
                    <div>
                      <span>Expected</span>
                      {orderDetailEditMode ? (
                        <input
                          type="date"
                          value={orderDetailDraft?.expected_delivery || ''}
                          onChange={(event) => handleOrderDetailFieldChange('expected_delivery', event.target.value)}
                        />
                      ) : (
                        <strong>{formatDate(orderDetail.expected_delivery)}</strong>
                      )}
                    </div>
                    <div><span>Payment Due</span><strong>{formatDate(orderDetail.payment_due_date)}</strong></div>
                    <div>
                      <span>Strict Due</span>
                      {orderDetailEditMode ? (
                        <input
                          type="date"
                          value={orderDetailDraft?.strict_due_date || ''}
                          onChange={(event) => handleOrderDetailFieldChange('strict_due_date', event.target.value)}
                        />
                      ) : (
                        <strong>{orderDetail.strict_due_date ? formatDate(orderDetail.strict_due_date) : '-'}</strong>
                      )}
                    </div>
                    <div><span>Next Action</span><strong>{getPoNextAction(orderDetail)}</strong></div>
                    <div><span>Bill No</span><strong>{orderDetail.bill_number || orderDetail.invoice_number || '-'}</strong></div>
                  </div>
                </div>

                <div className="po-party-grid">
                  <div className="po-party-card">
                    <h4>Supplier</h4>
                    <p>{orderDetailSupplier.name}</p>
                    <p>{orderDetailSupplier.phone}</p>
                    <p>{orderDetailSupplier.address}</p>
                  </div>
                  <div className="po-party-card">
                    <h4>Notes</h4>
                    {orderDetailEditMode ? (
                      <div className="po-detail-edit-stack">
                        <textarea
                          rows="3"
                          value={orderDetailDraft?.notes || ''}
                          onChange={(event) => handleOrderDetailFieldChange('notes', event.target.value)}
                          placeholder="PO notes"
                        />
                        <textarea
                          rows="3"
                          value={orderDetailDraft?.strict_due_note || ''}
                          onChange={(event) => handleOrderDetailFieldChange('strict_due_note', event.target.value)}
                          placeholder="Strict due note"
                        />
                      </div>
                    ) : (
                      <>
                        <p>{orderDetail.notes || '-'}</p>
                        <p>{orderDetail.strict_due_note || 'No strict deadline note'}</p>
                      </>
                    )}
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
                    {orderDetailItems.map((item, idx) => {
                      const line = getItemFinancials(item);
                      const selectedProduct = products.find((product) => String(product?.id || '') === String(item.product_id || '')) || null;
                      const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                      return (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td>{item.product_name}</td>
                          <td>
                            {orderDetailEditMode ? (
                              <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'quantity', event.target.value)}
                              />
                            ) : line.quantity}
                          </td>
                          <td>
                            {orderDetailEditMode ? (
                              <select
                                value={line.uom}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'uom', event.target.value)}
                              >
                                {uomOptions.map((uomOption) => (
                                  <option key={`detail-item-${idx}-uom-${uomOption}`} value={uomOption}>
                                    {uomOption}
                                  </option>
                                ))}
                              </select>
                            ) : (item.uom || '-')}
                          </td>
                          <td>
                            {orderDetailEditMode ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.rate}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'rate', event.target.value)}
                              />
                            ) : formatCurrency(line.rate)}
                          </td>
                          <td>
                            {orderDetailEditMode ? (
                              <select
                                value={item.gst_rate}
                                onChange={(event) => handleOrderDetailItemChange(idx, 'gst_rate', event.target.value)}
                              >
                                {GST_RATE_OPTIONS.map((rate) => (
                                  <option key={`detail-item-${idx}-gst-${rate}`} value={rate}>
                                    {rate}%
                                  </option>
                                ))}
                              </select>
                            ) : `${line.gstRate.toFixed(2)}%`}
                          </td>
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
                    <strong>{formatCurrency(orderDetailComputedTotals.taxableValue || 0)}</strong>
                  </div>
                  <div className="po-summary-row">
                    <span>GST</span>
                    <strong>{formatCurrency(orderDetailComputedTotals.taxAmount || 0)}</strong>
                  </div>
                  <div className="po-summary-row grand">
                    <span>Grand Total</span>
                    <strong>{formatCurrency(orderDetailComputedTotals.totalAmount || 0)}</strong>
                  </div>
                </div>

                <div className="po-history-section">
                  <div className="po-history-card">
                    <h4>Status Timeline</h4>
                    {(orderDetail.history || []).length ? (
                      <div className="po-history-list">
                        {orderDetail.history.slice(0, 6).map((entry) => (
                          <div key={`history-${entry.id}`} className="po-history-item">
                            <strong>{String(entry.to_status || '-').replace(/_/g, ' ')}</strong>
                            <span>{formatDateTime(entry.created_at)}</span>
                            <small>{entry.note || '-'}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="po-history-empty">No lifecycle history yet.</p>
                    )}
                  </div>
                  <div className="po-history-card">
                    <h4>Reminder Log</h4>
                    {(orderDetail.reminders || []).length ? (
                      <div className="po-history-list">
                        {orderDetail.reminders.slice(0, 6).map((entry) => (
                          <div key={`reminder-${entry.id}`} className="po-history-item">
                            <strong>{entry.title || entry.reminder_type || 'Reminder'}</strong>
                            <span>{formatDate(entry.scheduled_for)}</span>
                            <small>{entry.message || '-'}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="po-history-empty">No reminders logged yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}
            <div className="modal-actions">
              {orderDetailIsEditable ? (
                <button
                  type="button"
                  className="submit-btn"
                  onClick={orderDetailEditMode ? handleOrderDetailSave : openOrderDetailEditMode}
                  disabled={orderDetailSaving}
                >
                  {orderDetailEditMode ? (orderDetailSaving ? 'Saving...' : 'Save') : 'Edit'}
                </button>
              ) : null}
              <button
                type="button"
                className="submit-btn print-po-btn"
                onClick={() => handlePrintOrderDetail(orderDetail)}
                disabled={!orderDetail || orderDetailEditMode}
              >
                <Printer size={16} /> Print
              </button>
              <button type="button" className="cancel-btn" onClick={closeOrderDetail}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showProcessModal && processingOrder && (
        isMobile ? (
          <MobileBottomSheet
            open
            onClose={closeProcessModal}
            title="Confirm Purchase Order"
            className="purchase-process-sheet"
            actions={(
              <>
                <button type="button" className="cancel-btn" onClick={closeProcessModal} disabled={processSubmitting}>
                  Cancel
                </button>
                <button type="submit" form="purchase-process-form" className="submit-btn" disabled={processSubmitting}>
                  {processSubmitting ? 'Confirming...' : 'Confirm PO'}
                </button>
              </>
            )}
          >
            <form id="purchase-process-form" onSubmit={handleProcessSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>PO Number</label>
                  <input type="text" value={processingOrder.po_number || '-'} readOnly />
                </div>
                <div className="form-group">
                  <label>Distributor</label>
                  <input type="text" value={processingOrder.distributor_name || getDistributorName(processingOrder)} readOnly />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Total Amount</label>
                  <input type="text" value={formatCurrency(getOrderDisplayTotal(processingOrder))} readOnly />
                </div>
                <div className="form-group">
                  <label>Bill No *</label>
                  <input
                    type="text"
                    value={processFormData.bill_number}
                    onChange={(e) => setProcessFormData((prev) => ({ ...prev, bill_number: e.target.value }))}
                    placeholder="Enter bill number"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Initial Paid Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={processFormData.paid_amount}
                    onChange={(e) => setProcessFormData((prev) => ({ ...prev, paid_amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Payment Mode</label>
                  <select
                    value={processFormData.payment_mode}
                    onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    value={processFormData.payment_date}
                    onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Payment Reference</label>
                  <input
                    type="text"
                    value={processFormData.payment_reference}
                    onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_reference: e.target.value }))}
                    placeholder="Bank ref / UPI ref"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  rows="2"
                  value={processFormData.payment_notes}
                  onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_notes: e.target.value }))}
                  placeholder="Optional payment note"
                />
              </div>
            </form>
          </MobileBottomSheet>
        ) : (
          <div className="modal-overlay" onClick={closeProcessModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Confirm Purchase Order</h2>
                <button className="close-btn" onClick={closeProcessModal}>
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleProcessSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>PO Number</label>
                    <input type="text" value={processingOrder.po_number || '-'} readOnly />
                  </div>
                  <div className="form-group">
                    <label>Distributor</label>
                    <input type="text" value={processingOrder.distributor_name || getDistributorName(processingOrder)} readOnly />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Total Amount</label>
                    <input type="text" value={formatCurrency(getOrderDisplayTotal(processingOrder))} readOnly />
                  </div>
                  <div className="form-group">
                    <label>Bill No *</label>
                    <input
                      type="text"
                      value={processFormData.bill_number}
                      onChange={(e) => setProcessFormData((prev) => ({ ...prev, bill_number: e.target.value }))}
                      placeholder="Enter bill number"
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Initial Paid Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={processFormData.paid_amount}
                      onChange={(e) => setProcessFormData((prev) => ({ ...prev, paid_amount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select
                      value={processFormData.payment_mode}
                      onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="upi">UPI</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Payment Date</label>
                    <input
                      type="date"
                      value={processFormData.payment_date}
                      onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Reference</label>
                    <input
                      type="text"
                      value={processFormData.payment_reference}
                      onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_reference: e.target.value }))}
                      placeholder="Bank ref / UPI ref"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows="2"
                    value={processFormData.payment_notes}
                    onChange={(e) => setProcessFormData((prev) => ({ ...prev, payment_notes: e.target.value }))}
                    placeholder="Optional payment note"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={closeProcessModal} disabled={processSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={processSubmitting}>
                    {processSubmitting ? 'Confirming...' : 'Confirm PO'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      )}

      {showPoPaymentModal && paymentOrder && (
        isMobile ? (
          <MobileBottomSheet
            open
            onClose={closePoPaymentModal}
            title="Add PO Payment"
            className="purchase-payment-sheet"
            actions={(
              <>
                <button type="button" className="cancel-btn" onClick={closePoPaymentModal} disabled={poPaymentSubmitting}>
                  Cancel
                </button>
                <button type="submit" form="po-payment-form" className="submit-btn" disabled={poPaymentSubmitting}>
                  {poPaymentSubmitting ? 'Saving...' : 'Save Payment'}
                </button>
              </>
            )}
          >
            <form id="po-payment-form" onSubmit={handlePoPaymentSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>PO Number</label>
                  <input type="text" value={paymentOrder.po_number || '-'} readOnly />
                </div>
                <div className="form-group">
                  <label>Current Balance</label>
                  <input type="text" value={formatCurrency(getPoBalanceDue(paymentOrder))} readOnly />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={poPaymentFormData.amount}
                    onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Payment Mode</label>
                  <select
                    value={poPaymentFormData.payment_mode}
                    onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={poPaymentFormData.transaction_date}
                    onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Reference</label>
                  <input
                    type="text"
                    value={poPaymentFormData.reference}
                    onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, reference: e.target.value }))}
                    placeholder="Bank ref / UPI ref"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  rows="2"
                  value={poPaymentFormData.notes}
                  onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Optional note"
                />
              </div>
            </form>
          </MobileBottomSheet>
        ) : (
          <div className="modal-overlay" onClick={closePoPaymentModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add PO Payment</h2>
                <button className="close-btn" onClick={closePoPaymentModal}>
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handlePoPaymentSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label>PO Number</label>
                    <input type="text" value={paymentOrder.po_number || '-'} readOnly />
                  </div>
                  <div className="form-group">
                    <label>Current Balance</label>
                    <input type="text" value={formatCurrency(getPoBalanceDue(paymentOrder))} readOnly />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={poPaymentFormData.amount}
                      onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, amount: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Payment Mode</label>
                    <select
                      value={poPaymentFormData.payment_mode}
                      onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, payment_mode: e.target.value }))}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="upi">UPI</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      value={poPaymentFormData.transaction_date}
                      onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, transaction_date: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Reference</label>
                    <input
                      type="text"
                      value={poPaymentFormData.reference}
                      onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, reference: e.target.value }))}
                      placeholder="Bank ref / UPI ref"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    rows="2"
                    value={poPaymentFormData.notes}
                    onChange={(e) => setPoPaymentFormData((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional note"
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="cancel-btn" onClick={closePoPaymentModal} disabled={poPaymentSubmitting}>
                    Cancel
                  </button>
                  <button type="submit" className="submit-btn" disabled={poPaymentSubmitting}>
                    {poPaymentSubmitting ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      )}

      {/* Manual Distributor Ledger Modal */}
      {showLedgerForm && (
        isMobile ? (
          <MobileBottomSheet
            open
            onClose={() => setShowLedgerForm(false)}
            title="Add Distributor Payment / Credit"
            className="purchase-ledger-sheet"
            actions={(
              <>
                <button type="button" className="cancel-btn" onClick={() => setShowLedgerForm(false)}>
                  Cancel
                </button>
                <button type="submit" form="purchase-ledger-form" className="submit-btn">
                  Save Entry
                </button>
              </>
            )}
          >
            <form id="purchase-ledger-form" onSubmit={handleLedgerSubmit}>
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
            </form>
          </MobileBottomSheet>
        ) : (
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
        )
      )}

      {/* PO Ledger Correction Modal */}
      {showPoCorrectionForm && selectedCorrectionOrder && (
        isMobile ? (
          <MobileBottomSheet
            open
            onClose={closePoCorrectionForm}
            title="Correct PO Ledger Impact"
            className="purchase-correction-sheet"
            actions={(
              <>
                <button type="button" className="cancel-btn" onClick={closePoCorrectionForm} disabled={poCorrectionSubmitting}>
                  Cancel
                </button>
                <button type="submit" form="purchase-correction-form" className="submit-btn" disabled={poCorrectionSubmitting}>
                  {poCorrectionSubmitting ? 'Posting...' : 'Post Correction'}
                </button>
              </>
            )}
          >
            <form id="purchase-correction-form" onSubmit={handlePoCorrectionSubmit}>
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
            </form>
          </MobileBottomSheet>
        ) : (
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
        )
      )}

      {/* Return Form Modal */}
      {showReturnForm && (
        isMobile ? (
          <MobileBottomSheet
            open
            onClose={() => setShowReturnForm(false)}
            title="Create Purchase Return / Exchange"
            className="purchase-return-sheet"
            actions={(
              <>
                <button type="button" className="cancel-btn" onClick={() => setShowReturnForm(false)}>
                  Cancel
                </button>
                <button type="submit" form="purchase-return-form" className="submit-btn">
                  Create Return
                </button>
              </>
            )}
          >
            <form id="purchase-return-form" onSubmit={handleReturnSubmit}>
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
                  {returnFormData.items.map((item, index) => {
                    const selectedProduct = findProductForItem(products, item);
                    const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                    const selectedUom = resolvePurchaseUnitForProduct(
                      selectedProduct,
                      item.uom || selectedProduct?.base_unit || selectedProduct?.uom || 'pcs'
                    );
                    const quantityInBase = toBaseQtyForProduct(item.quantity, selectedUom, selectedProduct);
                    const lineTotal = quantityInBase * Math.max(0, toNumber(item.unit_price));
                    const baseUnitLabel = getProductUomProfile(selectedProduct).baseUnit;
                    return (
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
                        <select
                          value={selectedUom}
                          onChange={e => handleReturnItemChange(index, 'uom', e.target.value)}
                        >
                          {uomOptions.map((uomOption) => (
                            <option key={`return-item-${index}-uom-${uomOption}`} value={uomOption}>
                              {uomOption}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="item-field price">
                        <label>{`Unit Price (per ${baseUnitLabel})`}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={e => handleReturnItemChange(index, 'unit_price', parseFloat(e.target.value))}
                        />
                      </div>
                      <div className="item-field total">
                        <label>Total</label>
                        <span>{formatCurrency(lineTotal)}</span>
                      </div>
                      <button type="button" className="remove-item-btn" onClick={() => handleReturnItemRemove(index)}>
                        <X size={16} />
                      </button>
                    </div>
                    );
                  })}
                </div>
              </div>
            </form>
          </MobileBottomSheet>
        ) : (
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
                    {returnFormData.items.map((item, index) => {
                      const selectedProduct = findProductForItem(products, item);
                      const uomOptions = getAllowedPurchaseUnitsForProduct(selectedProduct);
                      const selectedUom = resolvePurchaseUnitForProduct(
                        selectedProduct,
                        item.uom || selectedProduct?.base_unit || selectedProduct?.uom || 'pcs'
                      );
                      const quantityInBase = toBaseQtyForProduct(item.quantity, selectedUom, selectedProduct);
                      const lineTotal = quantityInBase * Math.max(0, toNumber(item.unit_price));
                      const baseUnitLabel = getProductUomProfile(selectedProduct).baseUnit;
                      return (
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
                          <select
                            value={selectedUom}
                            onChange={e => handleReturnItemChange(index, 'uom', e.target.value)}
                          >
                            {uomOptions.map((uomOption) => (
                              <option key={`return-item-${index}-uom-${uomOption}`} value={uomOption}>
                                {uomOption}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="item-field price">
                          <label>{`Unit Price (per ${baseUnitLabel})`}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={e => handleReturnItemChange(index, 'unit_price', parseFloat(e.target.value))}
                          />
                        </div>
                        <div className="item-field total">
                          <label>Total</label>
                          <span>{formatCurrency(lineTotal)}</span>
                        </div>
                        <button type="button" className="remove-item-btn" onClick={() => handleReturnItemRemove(index)}>
                          <X size={16} />
                        </button>
                      </div>
                      );
                    })}
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
        )
      )}
    </div>
  );
}

export default PurchaseManagement;
