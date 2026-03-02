import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { customersApi, productsApi, billingApi, creditApi, usersApi } from '../services/api';
import { sendWhatsAppSmart } from '../utils/whatsapp';
import { formatCurrency } from '../utils/formatters';
import { buildBillShareText } from '../utils/messageTemplates';
import { isValidIndianPhone, normalizeIndianPhone, PHONE_POLICY_MESSAGE } from '../utils/phone';
import * as info from './info';
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

const BillingSystem = ({ initialPrefill = null, onPrefillApplied = null }) => {
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', address: '' });
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
        setError('Failed to load data. Please refresh the page.');
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

  const calculateAmount = useCallback((price, qty, disc, discType) => {
    const priceNum = Number(price) || 0;
    const qtyNum = Math.max(1, Number(qty) || 1);
    const discNum = Number(disc) || 0;

    const subtotal = priceNum * qtyNum;

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
          amount: calculateAmount(price, qty, disc, discType).amount,
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
        const matchedProduct = productsList.find(
          (product) => product.name && product.name.toLowerCase() === value.trim().toLowerCase()
        );

        if (matchedProduct) {
          const price = Number(matchedProduct.price) || 0;
          const disc = Number(matchedProduct.defaultDiscount) || 0;
          const discType = matchedProduct.discountType || 'fixed';

          newItems[index] = {
            ...newItems[index],
            name: matchedProduct.name,
            productId: matchedProduct.id,
            price,
            qty: 1,
            unit: matchedProduct.uom || matchedProduct.unit || 'pcs',
            disc,
            discType,
            amount: calculateAmount(price, 1, disc, discType).amount
          };
        } else {
          newItems[index] = { ...newItems[index], name: value };
          newItems[index].amount = calculateAmount(
            newItems[index].price,
            newItems[index].qty,
            newItems[index].disc,
            newItems[index].discType
          ).amount;
        }
      } else if (field === 'price') {
        newItems[index].price = value;
        newItems[index].amount = calculateAmount(value, newItems[index].qty, newItems[index].disc, newItems[index].discType).amount;
      } else if (field === 'qty') {
        const qty = Math.max(1, Number(value) || 1);
        newItems[index].qty = qty;
        newItems[index].amount = calculateAmount(newItems[index].price, qty, newItems[index].disc, newItems[index].discType).amount;
      } else if (field === 'disc') {
        const disc = Number(value) || 0;
        newItems[index].disc = disc;
        newItems[index].amount = calculateAmount(newItems[index].price, newItems[index].qty, disc, newItems[index].discType).amount;
      } else if (field === 'discType') {
        newItems[index].discType = value;
        newItems[index].amount = calculateAmount(newItems[index].price, newItems[index].qty, newItems[index].disc, value).amount;
      } else {
        newItems[index][field] = value;
      }

      return newItems;
    });
  }, [calculateAmount, productsList]);

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
    const discNum = Number(item.disc) || 0;
    if (item.discType === 'percentage') {
      const validDiscPercent = Math.min(100, Math.max(0, discNum));
      return sum + (priceNum * qtyNum * validDiscPercent) / 100;
    }
    return sum + Math.min(priceNum * qtyNum, Math.max(0, discNum));
  }, 0);

  const refreshData = useCallback(async () => {
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
      console.error('Error refreshing data:', err);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setLoading(false);
    }
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

    setCustomer((prev) => ({ ...prev, name: value }));

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

  const handleCreateBill = async () => {
    const hasItems = items.some((it) => it.name && it.amount > 0);

    if (!hasItems) {
      alert('Please add at least one item to the bill.');
      return;
    }
    if (!isOrderLinked && !isValidIndianPhone(customer.phone)) {
      alert(PHONE_POLICY_MESSAGE);
      return;
    }
    if (isOrderLinked && customer.phone && !isValidIndianPhone(customer.phone)) {
      alert(PHONE_POLICY_MESSAGE);
      return;
    }

    const paid = paidClamped;
    const normalizePhone = (value) => normalizeIndianPhone(value);
    const isSame = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

    const payload = {
      customer_id: customer.id || null,
      customer_name: customer.name,
      customer_email: customer.email || null,
      customer_phone: normalizeIndianPhone(customer.phone) || null,
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
        .map((it) => ({
          product_id: it.productId || null,
          product_name: it.name,
          mrp: Number(it.price) || 0,
          qty: Number(it.qty) || 0,
          unit: it.unit || 'pcs',
          discount:
            it.discType === 'percentage'
              ? (Number(it.price) || 0) * (Number(it.qty) || 0) * (Math.min(100, Math.max(0, Number(it.disc) || 0)) / 100)
              : Number(it.disc) || 0,
          amount: Number(it.amount) || 0
        }))
    };

    try {
      setIsSubmitting(true);

      // Keep order-linked billing minimal: backend binds to order and skips stock checks.
      let resolvedCustomerId = payload.customer_id || null;
      let itemsWithProducts = payload.items;

      if (!isOrderLinked) {
        let customerRecord = null;
        const phone = normalizePhone(payload.customer_phone);

        if (phone) {
          customerRecord = customersList.find((c) => normalizePhone(c.phone) === phone) || null;
          if (customerRecord) {
            const nameMatches = isSame(customerRecord.name, payload.customer_name);
            const emailMatches = isSame(customerRecord.email, payload.customer_email);
            if (nameMatches && emailMatches) {
              resolvedCustomerId = customerRecord.id;
            } else {
              const confirmUpdate = window.confirm(
                'A customer with this phone exists but name/email differ.\n' +
                'OK to update existing customer, Cancel to continue with existing details.'
              );
              if (confirmUpdate) {
                const updated = await usersApi.update(customerRecord.id, {
                  name: payload.customer_name,
                  email: payload.customer_email,
                  phone: payload.customer_phone,
                  address: payload.customer_address,
                  role: 'customer'
                });
                const updatedUser = updated?.user || updated || null;
                if (updatedUser) {
                  setCustomersList((prev) => prev.map((c) => (c.id === customerRecord.id ? updatedUser : c)));
                }
              }
              resolvedCustomerId = customerRecord.id;
            }
          }
        }

        if (!resolvedCustomerId) {
          const email = String(payload.customer_email || '').trim().toLowerCase();
          const emailMatch = email ? customersList.find((c) => String(c.email || '').trim().toLowerCase() === email) : null;

          if (emailMatch) {
            const confirmUpdatePhone = window.confirm(
              'A customer with this email exists but phone differs.\n' +
              'OK to update existing phone, Cancel to create a new customer.'
            );
            if (confirmUpdatePhone) {
              const updated = await usersApi.update(emailMatch.id, {
                name: payload.customer_name || emailMatch.name,
                email: payload.customer_email || emailMatch.email,
                phone: payload.customer_phone || emailMatch.phone,
                address: payload.customer_address || emailMatch.address,
                role: 'customer'
              });
              const updatedUser = updated?.user || updated || null;
              if (updatedUser) {
                setCustomersList((prev) => prev.map((c) => (c.id === emailMatch.id ? updatedUser : c)));
              }
              resolvedCustomerId = emailMatch.id;
            } else {
              const created = await usersApi.create({
                name: payload.customer_name,
                email: payload.customer_email,
                phone: payload.customer_phone,
                address: payload.customer_address,
                role: 'customer'
              });
              resolvedCustomerId = created?.user?.id || null;
              if (created?.user) {
                setCustomersList((prev) => [...prev, created.user]);
              }
            }
          } else {
            const created = await usersApi.create({
              name: payload.customer_name,
              email: payload.customer_email,
              phone: payload.customer_phone,
              address: payload.customer_address,
              role: 'customer'
            });
            resolvedCustomerId = created?.user?.id || null;
            if (created?.user) {
              setCustomersList((prev) => [...prev, created.user]);
            }
          }
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
        const phone = normalizePhone(payload.customer_phone);
        const byPhone = phone ? customersList.find((c) => normalizePhone(c.phone) === phone) : null;
        const byName = customersList.find((c) => String(c.name || '').trim().toLowerCase() === String(payload.customer_name || '').trim().toLowerCase());
        resolvedCustomerId = byPhone?.id || byName?.id || null;
      }

      if (!isOrderLinked && !resolvedCustomerId) {
        alert('Unable to resolve customer. Please verify customer details and try again.');
        return;
      }

      payload.customer_id = resolvedCustomerId;
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
      setCustomer({ name: '', email: '', phone: '', address: '' });
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
      <h1>Billing Invoice</h1>
      {prefillSummary ? <div className="billing-prefill-note">{prefillSummary}</div> : null}
      {isOrderLinked ? (
        <div className="billing-prefill-note">
          Linked order mode: customer details are locked. You can edit bill items, quantities, prices, and add/remove rows.
        </div>
      ) : null}

      {error && (
        <div className="error-message" role="alert">
          {error}
          <button onClick={refreshData} className="retry-btn">Retry</button>
        </div>
      )}

      {loading && <div className="loading-indicator">Loading...</div>}

      {!loading && !error && (
        <button onClick={refreshData} className="refresh-btn" aria-label="Refresh customer and product data">
          Refresh Data
        </button>
      )}

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
        <div>
          <label className="form-label" htmlFor="customerEmail">Email</label>
          <input
            id="customerEmail"
            type="email"
            className="form-input"
            value={customer.email}
            onChange={(e) => setCustomer((prev) => ({ ...prev, email: e.target.value }))}
            aria-label="Customer email"
            placeholder="email@example.com"
            autoComplete="email"
            readOnly={isOrderLinked}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="customerPhone">Phone {isOrderLinked ? '' : '*'}</label>
          <input
            id="customerPhone"
            type="tel"
            className="form-input"
            value={customer.phone}
            onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))}
            aria-label="Customer phone"
            placeholder="10-digit phone number"
            maxLength="10"
            autoComplete="tel"
            readOnly={isOrderLinked}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="customerAddress">Address</label>
          <input
            id="customerAddress"
            type="text"
            className="form-input"
            value={customer.address}
            onChange={(e) => setCustomer((prev) => ({ ...prev, address: e.target.value }))}
            aria-label="Customer address"
            placeholder="Full address"
            autoComplete="street-address"
            readOnly={isOrderLinked}
          />
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
            {items.map((item, index) => (
              <tr key={item.id}>
                <td data-label="Product Name">
                  <input
                    list="product-list"
                    value={item.name}
                    onChange={(e) => handleProductChange(index, 'name', e.target.value)}
                    aria-label="Product name"
                    placeholder="Type or select product..."
                    autoComplete="off"
                  />
                  <datalist id="product-list">
                    {productsList.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </td>
                <td data-label="Price">
                  <input
                    type="number"
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
                    value={item.qty}
                    onChange={(e) => handleProductChange(index, 'qty', e.target.value)}
                    aria-label="Quantity"
                    min="1"
                  />
                </td>
                <td data-label="Unit">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => handleProductChange(index, 'unit', e.target.value)}
                    aria-label="Unit of measurement"
                    placeholder="pcs, kg, etc."
                  />
                </td>
                <td data-label="Discount">
                  <div className="discount-field">
                    <input
                      type="number"
                      value={item.disc}
                      onChange={(e) => handleProductChange(index, 'disc', e.target.value)}
                      aria-label="Discount value"
                      min="0"
                      step={item.discType === 'percentage' ? '1' : '0.01'}
                      className="disc-input"
                    />
                    <select
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
            ))}
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
          setCustomer({ name: '', email: '', phone: '', address: '' });
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
          <textarea className="share-text" readOnly value={lastShareText} />
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
    </div>
  );
};

export default BillingSystem;

