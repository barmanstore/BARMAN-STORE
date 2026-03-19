import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { productsApi, billingApi, creditApi } from '../../../shared/services/api';
import { sendWhatsAppSmart } from '../../../shared/utils/whatsapp';
import { formatCurrency } from '../../../shared/utils/formatters';
import { validateAmountInput } from '../../../shared/utils/amountExpression';
import { buildBillShareText } from '../../../shared/utils/messageTemplates';
import useIsMobile from '../../../shared/hooks/useIsMobile';
import * as info from '../../../shared/info';
import BillingTabView from './components/BillingTabView';
import { createEmptyItem, getProductOptionLabel } from './utils/billingLineItemUtils';
import { calculateLineAmount } from './utils/billingAmountUtils';
import { getAllowedUnitsForProduct, resolveLineUnitForProduct, toPricingQtyFromProduct } from './utils/billingUnitUtils';
import useBillingCreateBill from './hooks/useBillingCreateBill';
import './BillingTab.css';

const mergeProductsById = (currentList = [], nextList = []) => {
  const byId = new Map();
  currentList.forEach((product) => {
    const id = Number(product?.id || 0);
    if (id > 0) byId.set(id, product);
  });
  nextList.forEach((product) => {
    const id = Number(product?.id || 0);
    if (id > 0) byId.set(id, product);
  });
  return Array.from(byId.values());
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

const BillingSystem = ({
  initialPrefill = null,
  onPrefillApplied = null,
  shortcutFocusRequest = 0,
  onShortcutFocusHandled = null,
}) => {
  const isMobile = useIsMobile();
  const [customer, setCustomer] = useState({ id: null, name: '', email: '', phone: '', address: '' });
  const [items, setItems] = useState([createEmptyItem()]);
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
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [activeProductSuggestionIndex, setActiveProductSuggestionIndex] = useState(0);

  const [customersList, setCustomersList] = useState([]);
  const [productsList, setProductsList] = useState([]);

  const customerSearchTimeout = useRef(null);
  const productSearchTimeout = useRef(null);
  const productSearchAbortController = useRef(null);
  const productSearchInputRef = useRef(null);
  const appliedPrefillKeyRef = useRef('');

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [customersData, productsData] = await Promise.all([
          billingApi.searchCustomers(''),
          billingApi.searchProducts('')
        ]);
        setCustomersList(Array.isArray(customersData) ? customersData : []);
        setProductsList(Array.isArray(productsData) ? productsData : []);
      } catch (err) {
        console.error('Error fetching initial data:', err);
        setError('Failed to load data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  useEffect(() => {
    return () => {
      if (customerSearchTimeout.current) {
        clearTimeout(customerSearchTimeout.current);
      }
      if (productSearchTimeout.current) {
        clearTimeout(productSearchTimeout.current);
      }
      if (productSearchAbortController.current) {
        productSearchAbortController.current.abort();
      }
    };
  }, []);

  const getProductForLine = useCallback((line = {}) => {
    const productId = Number(line?.productId || 0);
    if (productId > 0) {
      const byId = productsList.find((product) => Number(product?.id || 0) === productId);
      if (byId) return byId;
    }
    const nameKey = String(line?.name || '').trim().toLowerCase();
    if (!nameKey) return null;
    return productsList.find(
      (product) => String(product?.name || '').trim().toLowerCase() === nameKey
    ) || null;
  }, [productsList]);

  const buildBillingItemFromProduct = useCallback((product, baseItem = null) => {
    const nextItem = baseItem ? { ...baseItem } : createEmptyItem();
    const price = Number(product?.price || product?.mrp || 0) || 0;
    const disc = Number(product?.defaultDiscount || 0) || 0;
    const discType = product?.discountType || 'fixed';
    const unit = resolveLineUnitForProduct(
      product,
      product?.base_unit || product?.uom || product?.unit || 'pcs'
    );

    return {
      ...nextItem,
      name: String(product?.name || '').trim(),
      productId: Number(product?.id || 0) || null,
      price,
      qty: 1,
      unit,
      disc,
      discType,
      amount: calculateLineAmount(price, 1, disc, discType, unit, product).amount,
    };
  }, []);

  const calculateAmount = useCallback(
    (price, qty, disc, discType, unit = 'pcs', product = null) =>
      calculateLineAmount(price, qty, disc, discType, unit, product),
    []
  );

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
      ? prefillItemsRaw.map((item, index) => {
        const price = Math.max(0, Number(item?.price || item?.mrp || 0));
        const qty = Math.max(1, Number(item?.qty || item?.quantity || 1));
        const disc = Math.max(0, Number(item?.disc || item?.discount || 0));
        const discType = item?.discType === 'percentage' ? 'percentage' : 'fixed';
        return {
          id: item?.id || `prefill_item_${index}_${Date.now()}`,
          name: String(item?.name || item?.product_name || 'Item').trim() || 'Item',
          productId: Number(item?.productId || item?.product_id || 0) || null,
          price,
          qty,
          unit: String(item?.unit || item?.uom || 'pcs').trim() || 'pcs',
          disc,
          discType,
          amount: calculateAmount(
            price,
            qty,
            disc,
            discType,
            String(item?.unit || item?.uom || 'pcs').trim() || 'pcs',
            null
          ).amount,
        };
      })
      : [createEmptyItem()];

    setCustomer({
      id: Number(prefillCustomer?.id || 0) || null,
      name: String(prefillCustomer?.name || '').trim(),
      email: String(prefillCustomer?.email || '').trim(),
      phone: String(prefillCustomer?.phone || '').trim(),
      address: String(prefillCustomer?.address || '').trim(),
    });
    setItems(prefillItems);
    setPaidAmount(0);
    setLastShareText('');
    setLastShareNumber('');
    setLastSharePhone('');
    setLinkedOrderId(Number(initialPrefill?.source?.order_id || 0) || 0);
    setFulfillmentMode(Number(initialPrefill?.source?.order_id || 0) ? 'available_now' : 'full_now');
    setSelectedPaymentMethod('cash');

    const sourceOrderLabel = String(initialPrefill?.source?.order_number || '').trim()
      || (Number(initialPrefill?.source?.order_id || 0) ? `#${Number(initialPrefill.source.order_id)}` : '');
    setPrefillSummary(sourceOrderLabel ? `Order ${sourceOrderLabel} linked. Customer and items are auto-loaded.` : 'Order-linked billing loaded.');
    if (typeof onPrefillApplied === 'function') onPrefillApplied(initialPrefill);
  }, [initialPrefill, calculateAmount, onPrefillApplied]);

  const handleProductChange = useCallback((index, field, value) => {
    setItems((prevItems) => {
      const newItems = [...prevItems];

      if (field === 'name') {
        const rawValue = String(value || '');
        const valueKey = rawValue.trim().toLowerCase();
        const matchedProduct = productsList.find((product) => {
          const nameKey = String(product?.name || '').trim().toLowerCase();
          if (nameKey && nameKey === valueKey) return true;
          const optionLabel = getProductOptionLabel(product, formatCurrency).trim().toLowerCase();
          return optionLabel && optionLabel === valueKey;
        });

        if (matchedProduct) {
          newItems[index] = buildBillingItemFromProduct(matchedProduct, newItems[index]);
        } else {
          newItems[index] = { ...newItems[index], name: rawValue };
        }
      } else if (field === 'price') {
        newItems[index].price = value;
      } else if (field === 'qty') {
        const qty = Math.max(1, Number(value) || 1);
        newItems[index].qty = qty;
      } else if (field === 'disc') {
        const disc = Number(value) || 0;
        newItems[index].disc = disc;
      } else if (field === 'discType') {
        newItems[index].discType = value;
      } else {
        newItems[index][field] = value;
      }

      const currentLine = newItems[index];
      const productForAmount = getProductForLine(currentLine);
      currentLine.unit = resolveLineUnitForProduct(productForAmount, currentLine.unit);
      currentLine.amount = calculateAmount(
        currentLine.price,
        currentLine.qty,
        currentLine.disc,
        currentLine.discType,
        currentLine.unit,
        productForAmount
      ).amount;

      return newItems;
    });
  }, [buildBillingItemFromProduct, calculateAmount, getProductForLine, productsList]);

  const addItem = () => setItems((prev) => [...prev, createEmptyItem()]);

  const removeItem = (index) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const appendProductFromQuickAdd = useCallback((product) => {
    if (!product) return;

    setItems((prevItems) => {
      const lastItem = prevItems[prevItems.length - 1];
      const canReuseLastRow = prevItems.length === 1
        && !lastItem?.productId
        && !String(lastItem?.name || '').trim()
        && Number(lastItem?.amount || 0) <= 0;

      if (canReuseLastRow) {
        return [buildBillingItemFromProduct(product, lastItem)];
      }

      return [...prevItems, buildBillingItemFromProduct(product)];
    });

    setProductSearchQuery('');
    setProductSearchResults([]);
    setActiveProductSuggestionIndex(0);
    window.requestAnimationFrame(() => {
      productSearchInputRef.current?.focus();
    });
  }, [buildBillingItemFromProduct]);

  useEffect(() => {
    const query = String(productSearchQuery || '').trim();

    if (productSearchTimeout.current) {
      clearTimeout(productSearchTimeout.current);
    }
    if (productSearchAbortController.current) {
      productSearchAbortController.current.abort();
      productSearchAbortController.current = null;
    }

    if (!query) {
      setProductSearchLoading(false);
      setProductSearchResults([]);
      setActiveProductSuggestionIndex(0);
      return undefined;
    }

    const controller = new AbortController();
    productSearchAbortController.current = controller;
    setProductSearchLoading(true);

    productSearchTimeout.current = setTimeout(async () => {
      try {
        const rows = await billingApi.searchProducts(query, undefined, { signal: controller.signal });
        const list = Array.isArray(rows) ? rows : [];
        const visibleResults = list.slice(0, 8);
        setProductSearchResults(visibleResults);
        setActiveProductSuggestionIndex(0);
        if (visibleResults.length > 0) {
          setProductsList((prev) => mergeProductsById(prev, visibleResults));
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error('Error searching billing products:', err);
          setProductSearchResults([]);
        }
      } finally {
        if (productSearchAbortController.current === controller) {
          productSearchAbortController.current = null;
        }
        setProductSearchLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(productSearchTimeout.current);
      controller.abort();
    };
  }, [productSearchQuery]);

  useEffect(() => {
    if (loading || showCustomerCreateModal) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      productSearchInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [loading, showCustomerCreateModal]);

  useEffect(() => {
    if (!shortcutFocusRequest || loading || showCustomerCreateModal) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      productSearchInputRef.current?.focus();
      if (typeof onShortcutFocusHandled === 'function') {
        onShortcutFocusHandled();
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [
    loading,
    onShortcutFocusHandled,
    shortcutFocusRequest,
    showCustomerCreateModal,
  ]);

  const resolveQuickAddProductMatch = useCallback(() => {
    const query = String(productSearchQuery || '').trim().toLowerCase();
    if (!query) return null;

    const exactMatch = [...productSearchResults, ...productsList].find((product) => {
      const name = String(product?.name || '').trim().toLowerCase();
      const sku = String(product?.sku || '').trim().toLowerCase();
      const barcode = String(product?.barcode || '').trim().toLowerCase();
      return name === query || sku === query || barcode === query;
    });

    if (exactMatch) return exactMatch;
    return productSearchResults[activeProductSuggestionIndex] || productSearchResults[0] || null;
  }, [activeProductSuggestionIndex, productSearchQuery, productSearchResults, productsList]);

  const handleQuickAddKeyDown = useCallback((event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveProductSuggestionIndex((prev) => {
        if (productSearchResults.length === 0) return 0;
        return Math.min(prev + 1, productSearchResults.length - 1);
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveProductSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Escape') {
      setProductSearchResults([]);
      setActiveProductSuggestionIndex(0);
      return;
    }

    if (event.key !== 'Enter') return;

    const matchedProduct = resolveQuickAddProductMatch();
    if (!matchedProduct) return;

    event.preventDefault();
    appendProductFromQuickAdd(matchedProduct);
  }, [appendProductFromQuickAdd, productSearchResults.length, resolveQuickAddProductMatch]);

  const totalBill = items.reduce((sum, item) => sum + item.amount, 0);
  const paidAmountEvaluation = useMemo(
    () => validateAmountInput(paidAmount, { min: 0, max: totalBill }),
    [paidAmount, totalBill]
  );
  const paidResolved = paidAmountEvaluation.valid ? Number(paidAmountEvaluation.value) : 0;
  const paidClamped = Math.max(0, Math.min(paidResolved, Number(totalBill || 0)));
  const creditAmount = Math.max(0, Number(totalBill) - paidClamped);
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
  const subtotalAmount = items.reduce((sum, item) => {
    const priceNum = Number(item.price) || 0;
    const qtyNum = Math.max(1, Number(item.qty) || 1);
    const product = getProductForLine(item);
    const pricingQty = toPricingQtyFromProduct(qtyNum, item.unit, product);
    return sum + (priceNum * pricingQty);
  }, 0);
  const totalDiscount = items.reduce((sum, item) => {
    const priceNum = Number(item.price) || 0;
    const qtyNum = Math.max(1, Number(item.qty) || 1);
    const product = getProductForLine(item);
    const pricingQty = toPricingQtyFromProduct(qtyNum, item.unit, product);
    const discNum = Number(item.disc) || 0;
    if (item.discType === 'percentage') {
      const validDiscPercent = Math.min(100, Math.max(0, discNum));
      return sum + (priceNum * pricingQty * validDiscPercent) / 100;
    }
    return sum + Math.min(priceNum * pricingQty, Math.max(0, discNum));
  }, 0);
  const activeLineItemsCount = items.filter((item) =>
    String(item?.name || '').trim() || Number(item?.amount || 0) > 0
  ).length;
  const paymentStatusLabel = creditAmount > 0
    ? (paidClamped > 0 ? 'Partially paid' : 'Credit due')
    : 'Fully paid';

  const focusPaidAmountField = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.getElementById('paidAmount')?.focus();
    });
  }, []);

  const handleSelectFullPayment = useCallback(() => {
    setPaidAmount(totalBill > 0 ? Number(totalBill.toFixed(2)) : 0);
  }, [totalBill]);

  const handleSelectPartialPayment = useCallback(() => {
    if (!(paidClamped > 0 && paidClamped < totalBill)) {
      setPaidAmount('');
    }
    focusPaidAmountField();
  }, [focusPaidAmountField, paidClamped, totalBill]);

  const handleSelectFullCredit = useCallback(() => {
    setPaidAmount(0);
  }, []);

  const handleCustomerChange = useCallback((e) => {
    const { value } = e.target;

    if (customerSearchTimeout.current) {
      clearTimeout(customerSearchTimeout.current);
    }

    const exactMatch = customersList.find((c) => c.name && c.name.toLowerCase() === value.toLowerCase());
    if (exactMatch) {
      setCustomer({ ...exactMatch });
      return;
    }

    setCustomer({ id: null, name: value, email: '', phone: '', address: '' });

    if (value.length >= 2) {
      customerSearchTimeout.current = setTimeout(async () => {
        try {
          const searchResults = await billingApi.searchCustomers(value);
          const list = Array.isArray(searchResults) ? searchResults : [];
          if (list.length > 0) {
            setCustomersList((prev) => mergeCustomersById(prev, list));
            const matched = list.find(
              (entry) => String(entry?.name || '').trim().toLowerCase() === value.trim().toLowerCase()
            );
            if (matched) {
              setCustomer({ ...matched });
            }
          }
        } catch (err) {
          console.error('Error searching customers:', err);
        }
      }, 300);
    }
  }, [customersList]);

  const handleAddCustomer = useCallback(() => {
    if (isOrderLinked) return;
    const name = String(customer?.name || '').trim();
    const existing = customersList.find(
      (entry) => String(entry?.name || '').trim().toLowerCase() === name.toLowerCase()
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
          (entry) => String(entry?.name || '').trim().toLowerCase() === createdName
        ) || null;
      }

      if (matched) {
        setCustomersList((prev) => mergeCustomersById(prev, [matched]));
        setCustomer({ ...matched });
      }
    } catch (err) {
      alert(`Customer created, but refresh failed: ${err.message || 'Unknown error'}`);
    }
  }, []);

  const { handleCreateBill } = useBillingCreateBill({
    billingApi,
    creditApi,
    productsApi,
    customersList,
    productsList,
    setProductsList,
    customer,
    items,
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
    setCustomer,
    setItems,
    setPaidAmount,
    getProductForLine,
    resolveLineUnitForProduct,
    toPricingQtyFromProduct,
    buildBillShareText,
    createEmptyItem,
    info,
  });

  const handleCreateBillClick = useCallback(() => {
    const hasPaidAmount = String(paidAmount ?? '').trim() !== '';
    if (hasPaidAmount && !paidAmountEvaluation.valid) {
      setError(paidAmountEvaluation.message || 'Please enter a valid paid amount');
      return;
    }
    setError(null);
    handleCreateBill();
  }, [paidAmount, paidAmountEvaluation, handleCreateBill]);

  const handleCopyShare = async () => {
    if (!lastShareText) return;
    try {
      await navigator.clipboard.writeText(lastShareText);
      alert('Bill text copied.');
    } catch (err) {
      alert('Failed to copy bill text.');
    }
  };

  const handleSendWhatsApp = async () => {
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
      alert('Message was long. Opened WhatsApp chat, please paste message manually.');
    }
  };

  const getProductOptionLabelWithFormat = useCallback((product) => getProductOptionLabel(product, formatCurrency), []);
  const handleClear = useCallback(() => {
    setCustomer({ id: null, name: '', email: '', phone: '', address: '' });
    setItems([createEmptyItem()]);
    setPaidAmount(0);
    setPrefillSummary('');
    setLinkedOrderId(0);
    setFulfillmentMode('available_now');
    setSelectedPaymentMethod('cash');
    setProductSearchQuery('');
    setProductSearchResults([]);
    setActiveProductSuggestionIndex(0);
  }, []);

  return (
    <BillingTabView
      isMobile={isMobile}
      isOrderLinked={isOrderLinked}
      isSubmitting={isSubmitting}
      handleAddCustomer={handleAddCustomer}
      prefillSummary={prefillSummary}
      error={error}
      loading={loading}
      customer={customer}
      customersList={customersList}
      handleCustomerChange={handleCustomerChange}
      items={items}
      productsList={productsList}
      getProductOptionLabel={getProductOptionLabelWithFormat}
      getProductForLine={getProductForLine}
      getAllowedUnitsForProduct={getAllowedUnitsForProduct}
      resolveLineUnitForProduct={resolveLineUnitForProduct}
      handleProductChange={handleProductChange}
      productSearchInputRef={productSearchInputRef}
      productSearchQuery={productSearchQuery}
      setProductSearchQuery={setProductSearchQuery}
      productSearchResults={productSearchResults}
      productSearchLoading={productSearchLoading}
      activeProductSuggestionIndex={activeProductSuggestionIndex}
      handleQuickAddKeyDown={handleQuickAddKeyDown}
      handleQuickAddSelect={appendProductFromQuickAdd}
      removeItem={removeItem}
      addItem={addItem}
      subtotalAmount={subtotalAmount}
      totalDiscount={totalDiscount}
      totalBill={totalBill}
      paidClamped={paidClamped}
      paymentIntent={paymentIntent}
      selectedPaymentMethod={selectedPaymentMethod}
      effectivePaymentMethod={effectivePaymentMethod}
      setSelectedPaymentMethod={setSelectedPaymentMethod}
      handleSelectFullPayment={handleSelectFullPayment}
      handleSelectPartialPayment={handleSelectPartialPayment}
      handleSelectFullCredit={handleSelectFullCredit}
      fulfillmentMode={fulfillmentMode}
      setFulfillmentMode={setFulfillmentMode}
      paidAmount={paidAmount}
      setPaidAmount={setPaidAmount}
      creditAmount={creditAmount}
      activeLineItemsCount={activeLineItemsCount}
      paymentStatusLabel={paymentStatusLabel}
      onClear={handleClear}
      handleCreateBill={handleCreateBillClick}
      lastShareText={lastShareText}
      lastShareNumber={lastShareNumber}
      handleCopyShare={handleCopyShare}
      handleSendWhatsApp={handleSendWhatsApp}
      showCustomerCreateModal={showCustomerCreateModal}
      handleCustomerModalClose={() => setShowCustomerCreateModal(false)}
      handleCustomerModalSave={handleCustomerModalSave}
      customerCreateName={String(customer?.name || '').trim()}
    />
  );
};

export default BillingSystem;


