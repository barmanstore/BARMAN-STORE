import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { customersApi, productsApi, billingApi, creditApi } from '../../../services/api';
import { sendWhatsAppSmart } from '../../../utils/whatsapp';
import { formatCurrency } from '../../../utils/formatters';
import { buildBillShareText } from '../../../utils/messageTemplates';
import * as info from '../../../shared/info';
import UserEditModal from '../../../shared/components/UserEditModal';
import './BillingTab.css';

const createEmptyItem = () => ({
  id: Date.now() + Math.random(),
  name: '',
  price: 0,
  qty: 1,
  unit: 'pcs',
  disc: 0,
  discType: 'fixed',
  amount: 0
});

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
  return { sellingUnit, baseUnit, conversionFactor };
};

const getAllowedUnitsForProduct = (product = null) => {
  if (!product) return ['pcs'];
  const profile = getProductUomProfile(product);
  const familyUnits = getAllowedUnitsFromBaseUnit(profile.baseUnit);
  if (familyUnits.length) return familyUnits;
  if (profile.baseUnit === profile.sellingUnit) return [profile.baseUnit];
  return [...new Set([profile.baseUnit, profile.sellingUnit])];
};

const getProductOptionLabel = (product = null) => {
  if (!product) return '';
  const name = String(product.name || '').trim() || 'Product';
  const price = Number(product.price ?? product.mrp ?? 0) || 0;
  const defaultUnit = resolveLineUnitForProduct(
    product,
    product.base_unit || product.uom || product.unit || 'pcs'
  );
  const parts = [name];
  if (price > 0) {
    parts.push(`${formatCurrency(price)} / ${defaultUnit}`);
  }
  if (product.sku) {
    parts.push(`SKU: ${String(product.sku).trim()}`);
  }
  if (product.brand) {
    parts.push(String(product.brand).trim());
  }
  return parts.join(' • ');
};

const resolveLineUnitForProduct = (product = null, unit = 'pcs') => {
  if (!product) return normalizeUomToken(unit, 'pcs');
  const allowedUnits = getAllowedUnitsForProduct(product);
  const requestedUnit = normalizeUomToken(unit, allowedUnits[0] || 'pcs');
  return allowedUnits.includes(requestedUnit) ? requestedUnit : (allowedUnits[0] || requestedUnit);
};

const toPricingQtyFromProduct = (qty, unit, product = null) => {
  const numericQty = Math.max(0, Number(qty || 0));
  if (numericQty <= 0) return 0;
  if (!product) return numericQty;
  const profile = getProductUomProfile(product);
  const inputUnit = resolveLineUnitForProduct(product, unit);
  const familyConverted = convertQtyBetweenFamilyUnits(numericQty, inputUnit, profile.baseUnit, profile.baseUnit);
  if (familyConverted !== null) return familyConverted;
  if (inputUnit === profile.baseUnit) return numericQty;
  if (inputUnit === profile.sellingUnit && profile.sellingUnit !== profile.baseUnit) {
    return numericQty / profile.conversionFactor;
  }
  return numericQty;
};

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

  const calculateAmount = useCallback((price, qty, disc, discType, unit = 'pcs', product = null) => {
    const priceNum = Number(price) || 0;
    const qtyNum = Math.max(1, Number(qty) || 1);
    const pricingQty = toPricingQtyFromProduct(qtyNum, unit, product);
    const discNum = Number(disc) || 0;

    const subtotal = priceNum * pricingQty;

    let discountAmount = 0;
    if (discType === 'percentage') {
      const validDiscPercent = Math.min(100, Math.max(0, discNum));
      discountAmount = (subtotal * validDiscPercent) / 100;
    } else {
      discountAmount = Math.min(subtotal, Math.max(0, discNum));
    }

    return { amount: Math.max(0, subtotal - discountAmount) };
  }, []);

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
          const optionLabel = getProductOptionLabel(product).trim().toLowerCase();
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

  const handleCreateBill = async () => {
    const hasItems = items.some((it) => it.name && it.amount > 0);

    if (!hasItems) {
      alert('Please add at least one item to the bill.');
      return;
    }
    if (!String(customer?.name || '').trim()) {
      alert('Please select or enter a customer name.');
      return;
    }

    const paid = paidClamped;

    const payload = {
      customer_id: customer.id || null,
      customer_name: customer.name,
      customer_email: customer.email || null,
      customer_phone: customer.phone || null,
      customer_address: customer.address || null,
      discount_amount: Number(totalDiscount.toFixed(2)),
      total_amount: Number(totalBill.toFixed(2)),
      paid_amount: Number(paid.toFixed(2)),
      credit_amount: Number(creditAmount.toFixed(2)),
      payment_method: 'cash',
      payment_status: paid < Number(totalBill || 0) ? 'pending' : 'paid',
      bill_type: 'sales',
      order_id: isOrderLinked ? Number(linkedOrderId || 0) : null,
      fulfillment_mode: isOrderLinked ? fulfillmentMode : 'full_now',
      items: items
        .filter((it) => it.name && Number(it.amount) > 0)
        .map((it) => {
          const product = getProductForLine(it);
          const pricingQty = toPricingQtyFromProduct(it.qty, it.unit, product);
          const normalizedUnit = resolveLineUnitForProduct(product, it.unit);
          return {
            product_id: it.productId || null,
            product_name: it.name,
            mrp: Number(it.price) || 0,
            qty: Number(it.qty) || 0,
            ...(normalizedUnit ? { unit: normalizedUnit } : {}),
            discount:
              it.discType === 'percentage'
                ? (Number(it.price) || 0) * pricingQty * (Math.min(100, Math.max(0, Number(it.disc) || 0)) / 100)
                : Number(it.disc) || 0,
            amount: Number(it.amount) || 0
          };
        })
    };

    try {
      setIsSubmitting(true);

      // Keep order-linked billing minimal: backend binds to order and skips stock checks.
      let resolvedCustomerId = payload.customer_id || null;
      let itemsWithProducts = payload.items;

      if (!isOrderLinked) {
        if (!resolvedCustomerId) {
          const byName = customersList.find(
            (entry) =>
              String(entry?.name || '').trim().toLowerCase() ===
              String(payload.customer_name || '').trim().toLowerCase()
          );
          resolvedCustomerId = byName?.id || null;
        }

        const productUpdates = [];
        itemsWithProducts = payload.items.map((it) => {
          let product = null;
          if (it.product_id) {
            product = productsList.find((p) => p.id === it.product_id) || null;
          }
          if (!product) {
            const name = String(it.product_name || '').trim().toLowerCase();
            product = productsList.find((p) => String(p.name || '').trim().toLowerCase() === name) || null;
          }
          if (product) {
            it.product_id = product.id;
            return it;
          }
          productUpdates.push(productsApi.create({
            name: it.product_name,
            price: Number(it.mrp || 0),
            mrp: Number(it.mrp) || 0,
            uom: it.unit || 'pcs',
            category: 'Groceries',
            stock: 0
          }).then((createdProduct) => {
            if (createdProduct?.id) {
              it.product_id = createdProduct.id;
              setProductsList((prev) => [...prev, createdProduct]);
            }
            return it;
          }));
          return it;
        });

        if (productUpdates.length) {
          await Promise.all(productUpdates);
        }
      } else if (!resolvedCustomerId) {
        const byName = customersList.find((c) => String(c.name || '').trim().toLowerCase() === String(payload.customer_name || '').trim().toLowerCase());
        resolvedCustomerId = byName?.id || null;
      }

      if (!isOrderLinked && !resolvedCustomerId) {
        alert('Please select an existing customer or click "Add Customer".');
        return;
      }

      const resolvedCustomer =
        customersList.find((entry) => Number(entry?.id || 0) === Number(resolvedCustomerId || 0)) || customer;
      payload.customer_id = resolvedCustomerId;
      payload.customer_email = resolvedCustomer?.email || null;
      payload.customer_phone = resolvedCustomer?.phone || null;
      payload.customer_address = resolvedCustomer?.address || null;
      payload.items = itemsWithProducts;

      const result = await billingApi.createBill(payload);
      let currentTotalCredit = Number(payload.credit_amount || 0);
      if (payload.customer_id) {
        try {
          const balanceData = await creditApi.getBalance(payload.customer_id);
          currentTotalCredit = Number(balanceData?.balance || 0);
        } catch (_) {
          // Keep bill flow resilient; fall back to this bill's credit amount.
        }
      }
      const shareText = buildBillShareText({
        companyTitle: info.TITLE || 'BARMAN STORE',
        billNumber: result?.bill_number,
        createdAt: new Date().toISOString(),
        customerName: payload.customer_name,
        customerPhone: payload.customer_phone,
        customerEmail: payload.customer_email,
        customerAddress: payload.customer_address,
        items: payload.items,
        totalAmount: payload.total_amount,
        paidAmount: payload.paid_amount,
        creditAmount: payload.credit_amount,
        currentTotalCredit,
        paymentStatus: payload.payment_status,
        onlineStoreUrl: info.ONLINE_STORE_URL,
        thankYouLine: 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।'
      });
      setLastShareText(shareText);
      setLastShareNumber(result?.bill_number || '');
      setLastSharePhone(payload.customer_phone || '');
      setPrefillSummary('');
      if (isOrderLinked) {
        setLinkedOrderId(0);
        setFulfillmentMode('available_now');
      }
      alert('Bill created successfully.');
      setCustomer({ id: null, name: '', email: '', phone: '', address: '' });
      setItems([createEmptyItem()]);
      setPaidAmount(0);
    } catch (err) {
      console.error('Error creating bill:', err);
      alert(`Failed to create bill: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

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

  return (
    <div className="billing-content">
      <div className="billing-header">
        <h1>Billing Invoice</h1>
        {!isOrderLinked ? (
          <button
            type="button"
            className="add-customer-btn"
            onClick={handleAddCustomer}
            disabled={isSubmitting}
            aria-label="Add customer"
          >
            <UserPlus size={16} />
            Add Customer
          </button>
        ) : null}
      </div>
      {prefillSummary ? <div className="billing-prefill-note">{prefillSummary}</div> : null}
      {isOrderLinked ? (
        <div className="billing-prefill-note">
          Linked order mode: customer details are locked. You can edit bill items, quantities, prices, and add/remove rows.
        </div>
      ) : null}

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {loading && <div className="loading-indicator">Loading...</div>}

      <div className="form-section">
        <div className="form-row">
          <label className="form-label" htmlFor="customerName">Customer Name {isOrderLinked ? '' : '*'}</label>
          <input
            id="customerName"
            list="customer-list"
            className="form-input"
            value={customer.name}
            onChange={handleCustomerChange}
            placeholder="Type or select name..."
            aria-label="Customer name"
            aria-autocomplete="list"
            autoComplete="name"
            required={!isOrderLinked}
            readOnly={isOrderLinked}
          />
          <datalist id="customer-list">
            {customersList.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="table-container">
        <table className="billing-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th className="w-24">Price</th>
              <th className="w-20">Qty</th>
              <th className="w-24">Unit</th>
              <th className="w-28">Disc</th>
              <th className="w-32">Amount</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const rowProduct = getProductForLine(item);
              const unitOptions = rowProduct ? getAllowedUnitsForProduct(rowProduct) : [];
              const selectedUnit = rowProduct
                ? resolveLineUnitForProduct(rowProduct, item.unit)
                : (String(item.unit || '').trim() || 'pcs');
              return (
              <tr key={item.id}>
                <td data-label="Product Name">
                  <input
                    id={`product-name-${item.id}`}
                    name="product_name"
                    list="product-list"
                    value={item.name}
                    onChange={(e) => handleProductChange(index, 'name', e.target.value)}
                    aria-label="Product name"
                    placeholder="Type or select product..."
                    autoComplete="off"
                  />
                  <datalist id="product-list">
                    {productsList.map((p) => (
                      <option key={p.id} value={getProductOptionLabel(p)} />
                    ))}
                  </datalist>
                </td>
                <td data-label="Price">
                  <input
                    type="number"
                    id={`product-price-${item.id}`}
                    name="price"
                    value={item.price}
                    onChange={(e) => handleProductChange(index, 'price', e.target.value)}
                    aria-label="Price per unit"
                    min="0"
                    step="0.01"
                  />
                </td>
                <td data-label="Quantity">
                  <input
                    type="number"
                    id={`product-qty-${item.id}`}
                    name="qty"
                    value={item.qty}
                    onChange={(e) => handleProductChange(index, 'qty', e.target.value)}
                    aria-label="Quantity"
                    min="1"
                  />
                </td>
                <td data-label="Unit">
                  {rowProduct ? (
                    <select
                      id={`product-unit-${item.id}`}
                      name="unit"
                      value={selectedUnit}
                      onChange={(e) => handleProductChange(index, 'unit', e.target.value)}
                      aria-label="Unit of measurement"
                    >
                      {unitOptions.map((unitOption) => (
                        <option key={`${item.id}-unit-${unitOption}`} value={unitOption}>
                          {unitOption}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      id={`product-unit-${item.id}`}
                      name="unit"
                      value={item.unit}
                      onChange={(e) => handleProductChange(index, 'unit', e.target.value)}
                      aria-label="Unit of measurement"
                      placeholder="pcs, kg, etc."
                    />
                  )}
                </td>
                <td data-label="Discount">
                  <div className="discount-field">
                    <input
                      type="number"
                      id={`product-disc-${item.id}`}
                      name="disc"
                      value={item.disc}
                      onChange={(e) => handleProductChange(index, 'disc', e.target.value)}
                      aria-label="Discount value"
                      min="0"
                      step={item.discType === 'percentage' ? '1' : '0.01'}
                      className="disc-input"
                    />
                    <select
                      id={`product-disc-type-${item.id}`}
                      name="discType"
                      value={item.discType}
                      onChange={(e) => handleProductChange(index, 'discType', e.target.value)}
                      aria-label="Discount type"
                      className="disc-type-select"
                    >
                      <option value="fixed">Rs</option>
                      <option value="percentage">%</option>
                    </select>
                  </div>
                </td>
                <td className="amount-cell" data-label="Amount">{formatCurrency(item.amount)}</td>
                <td className="text-center" data-label="Action">
                  <button
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="delete-btn"
                    aria-label="Remove item"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button onClick={addItem} className="add-btn" aria-label="Add new product">
          <Plus size={18} /> Add Item
        </button>
        <div className="total-section">
          <p>Total Payable:</p>
          <p>{formatCurrency(totalBill)}</p>
        </div>
      </div>

      <div className="form-section">
        {isOrderLinked ? (
          <div className="form-row">
            <label className="form-label" htmlFor="fulfillmentMode">Billing Mode</label>
            <select
              id="fulfillmentMode"
              className="form-input"
              value={fulfillmentMode}
              onChange={(e) => setFulfillmentMode(String(e.target.value || 'available_now'))}
            >
              <option value="available_now">Bill available now</option>
              <option value="full_now">Bill full now</option>
            </select>
          </div>
        ) : null}
        <div className="form-row">
          <label className="form-label" htmlFor="paidAmount">Paid Amount</label>
          <input
            id="paidAmount"
            type="number"
            min="0"
            step="0.01"
            className="form-input"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="form-row">
          <label className="form-label">Credit </label>
          <div className="form-input" aria-live="polite">
            {formatCurrency(creditAmount)}
          </div>
        </div>
      </div>

      <div className="billing-form-controls">
        <button className="reset" onClick={() => {
          setCustomer({ id: null, name: '', email: '', phone: '', address: '' });
          setItems([createEmptyItem()]);
          setPaidAmount(0);
          setPrefillSummary('');
          setLinkedOrderId(0);
          setFulfillmentMode('available_now');
        }}>
          Clear
        </button>
        <button 
          className="submit" 
          onClick={handleCreateBill} 
          disabled={isSubmitting}
        >
          Create Bill
        </button>
      </div>

      {lastShareText && (
        <div className="share-box">
          <div className="share-header">
            <strong>Share Bill {lastShareNumber ? `#${lastShareNumber}` : ''}</strong>
          </div>
          <textarea className="share-text" id="billing-share-text" name="share_text" readOnly value={lastShareText} />
          <div className="share-actions">
            <button className="share-btn" onClick={handleCopyShare}>Copy</button>
            <button
              type="button"
              className="share-btn whatsapp"
              onClick={handleSendWhatsApp}
            >
              WhatsApp
            </button>
          </div>
        </div>
      )}
      {showCustomerCreateModal ? (
        <UserEditModal
          isCreate={true}
          createPrefill={{ name: String(customer?.name || '').trim() }}
          onClose={() => setShowCustomerCreateModal(false)}
          onSave={handleCustomerModalSave}
        />
      ) : null}
    </div>
  );
};

export default BillingSystem;

