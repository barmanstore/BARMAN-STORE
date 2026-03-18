import React, { useState, useCallback, useEffect, useRef } from 'react';
import { customersApi, productsApi, billingApi, creditApi } from '../../../shared/services/api';
import { sendWhatsAppSmart } from '../../../shared/utils/whatsapp';
import { formatCurrency } from '../../../shared/utils/formatters';
import { buildBillShareText } from '../../../shared/utils/messageTemplates';
import * as info from '../../../shared/info';
import BillingTabView from './components/BillingTabView';
import { createEmptyItem, getProductOptionLabel } from './utils/billingLineItemUtils';
import { calculateLineAmount } from './utils/billingAmountUtils';
import { getAllowedUnitsForProduct, resolveLineUnitForProduct, toPricingQtyFromProduct } from './utils/billingUnitUtils';
import useBillingCreateBill from './hooks/useBillingCreateBill';
import './BillingTab.css';

const BillingSystem = ({ initialPrefill = null, onPrefillApplied = null }) => {
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

  const [customersList, setCustomersList] = useState([]);
  const [productsList, setProductsList] = useState([]);

  const customerSearchTimeout = useRef(null);
  const appliedPrefillKeyRef = useRef('');

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [customersData, productsData] = await Promise.all([
          customersApi.getAll(),
          productsApi.getAll()
        ]);
        setCustomersList(customersData || []);
        setProductsList(productsData || []);
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
          const price = Number(matchedProduct.price) || 0;
          const disc = Number(matchedProduct.defaultDiscount) || 0;
          const discType = matchedProduct.discountType || 'fixed';
          const defaultUnit = resolveLineUnitForProduct(
            matchedProduct,
            matchedProduct.base_unit || matchedProduct.uom || matchedProduct.unit || 'pcs'
          );

          newItems[index] = {
            ...newItems[index],
            name: matchedProduct.name,
            productId: matchedProduct.id,
            price,
            qty: 1,
            unit: defaultUnit,
            disc,
            discType,
            amount: calculateAmount(
              price,
              1,
              disc,
              discType,
              defaultUnit,
              matchedProduct
            ).amount
          };
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
  }, [calculateAmount, getProductForLine, productsList]);

  const addItem = () => setItems((prev) => [...prev, createEmptyItem()]);

  const removeItem = (index) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const totalBill = items.reduce((sum, item) => sum + item.amount, 0);
  const paidClamped = Math.max(0, Math.min(Number(paidAmount || 0), Number(totalBill || 0)));
  const creditAmount = Math.max(0, Number(totalBill) - paidClamped);
  const isOrderLinked = Number(linkedOrderId || 0) > 0;
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
          const searchResults = await customersApi.search(value);
          if (searchResults && searchResults.length > 0) {
            setCustomer({ ...searchResults[0] });
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
      const latestCustomers = await customersApi.getAll();
      const list = Array.isArray(latestCustomers) ? latestCustomers : [];
      setCustomersList(list);

      const createdId = Number(createdUser?.id || createdUser?.user_id || 0);
      const createdName = String(createdUser?.name || '').trim().toLowerCase();

      let matched = null;
      if (createdId > 0) {
        matched = list.find((entry) => Number(entry?.id || 0) === createdId) || null;
      }
      if (!matched && createdName) {
        matched = list.find(
          (entry) => String(entry?.name || '').trim().toLowerCase() === createdName
        ) || null;
      }

      if (matched) {
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
  const handleClear = useCallback(() => { setCustomer({ id: null, name: '', email: '', phone: '', address: '' }); setItems([createEmptyItem()]); setPaidAmount(0); setPrefillSummary(''); setLinkedOrderId(0); setFulfillmentMode('available_now'); }, []);

  return (
    <BillingTabView
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
      removeItem={removeItem}
      addItem={addItem}
      totalBill={totalBill}
      fulfillmentMode={fulfillmentMode}
      setFulfillmentMode={setFulfillmentMode}
      paidAmount={paidAmount}
      setPaidAmount={setPaidAmount}
      creditAmount={creditAmount}
      onClear={handleClear}
      handleCreateBill={handleCreateBill}
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


