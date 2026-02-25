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

const BillingSystem = () => {
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '', address: '' });
  const [items, setItems] = useState([createEmptyItem()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paidAmount, setPaidAmount] = useState(0);
  const [lastShareText, setLastShareText] = useState('');
  const [lastShareNumber, setLastShareNumber] = useState('');
  const [lastSharePhone, setLastSharePhone] = useState('');

  const [customersList, setCustomersList] = useState([]);
  const [productsList, setProductsList] = useState([]);

  const customerSearchTimeout = useRef(null);

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
    if (!isValidIndianPhone(customer.phone)) {
      alert(PHONE_POLICY_MESSAGE);
      return;
    }

    const paid = paidClamped;
    const normalizePhone = (value) => normalizeIndianPhone(value);
    const isSame = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    const findCustomerMatch = () => {
      const phone = normalizePhone(customer.phone);
      if (phone) {
        const match = customersList.find((c) => normalizePhone(c.phone) === phone);
        if (match) return match;
      }
      const name = String(customer.name || '').trim().toLowerCase();
      if (!name) return null;
      const email = String(customer.email || '').trim().toLowerCase();
      return customersList.find((c) => {
        if (email && String(c.email || '').trim().toLowerCase() === email) return true;
        return String(c.name || '').trim().toLowerCase() === name;
      }) || null;
    };

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

      // Ensure customer exists (create or update) with phone/email/name checks
      let resolvedCustomerId = payload.customer_id || null;
      let customerRecord = null;

      const phone = normalizePhone(payload.customer_phone);

      // 1) If phone provided, check by phone first
      if (phone) {
        customerRecord = customersList.find((c) => normalizePhone(c.phone) === phone) || null;

        if (customerRecord) {
          const nameMatches = isSame(customerRecord.name, payload.customer_name);
          const emailMatches = isSame(customerRecord.email, payload.customer_email);

          if (nameMatches && emailMatches) {
            // exact match, reuse
            resolvedCustomerId = customerRecord.id;
          } else {
            // phone exists but details differ -> ask user whether to update existing customer
            const confirmUpdate = window.confirm(
              'A customer with this phone number already exists but name/email differ.\n' +
              'OK to update the existing customer with entered details, Cancel to use existing customer as-is.'
            );
            if (confirmUpdate) {
              // update on server and update local list
              const updated = await usersApi.update(customerRecord.id, {
                name: payload.customer_name,
                email: payload.customer_email,
                phone: payload.customer_phone,
                address: payload.customer_address,
                role: 'customer'
              });
              // handle different API shapes: try to extract user object
              const updatedUser = updated?.user || updated || null;
              if (updatedUser) {
                setCustomersList((prev) => prev.map((c) => (c.id === customerRecord.id ? updatedUser : c)));
              }
              resolvedCustomerId = customerRecord.id;
            } else {
              // use existing record without modification
              resolvedCustomerId = customerRecord.id;
            }
          }
        }
      }

      // 2) If no phone-match found, and no resolved id yet, check if email is new or existing
      if (!resolvedCustomerId) {
        const email = String(payload.customer_email || '').trim().toLowerCase();
        const emailMatch = email ? customersList.find((c) => String(c.email || '').trim().toLowerCase() === email) : null;

        if (emailMatch) {
          // Email exists but phone did not match - ask whether to update phone on existing record
          const confirmUpdatePhone = window.confirm(
            'A customer with this email already exists but phone number differs.\n' +
            'OK to update the existing customer phone to the entered phone, Cancel to create a new customer.'
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
            // create new customer (even though email exists) per request - but warn about possible duplicate
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
          // Neither phone nor email found -> create new customer
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

      // Ensure products exist (create or update)
      const productUpdates = [];
      const itemsWithProducts = payload.items.map((it) => {
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
          const needsUpdate =
            Number(product.price || 0) !== Number(it.mrp || 0) ||
            String(product.uom || '').toLowerCase() !== String(it.unit || '').toLowerCase();
          if (needsUpdate) {
            productUpdates.push(productsApi.update(product.id, {
              name: product.name,
              price: Number(it.mrp || 0),
              mrp: Number(it.mrp || 0),
              uom: it.unit || 'pcs',
              category: product.category || 'Groceries'
            }));
          }
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

      payload.customer_id = resolvedCustomerId;
      payload.items = itemsWithProducts;

      const result = await billingApi.createBill(payload);
      if (payload.customer_id && creditAmount > 0) {
        await creditApi.addTransaction(payload.customer_id, {
          type: 'given',
          amount: Number(creditAmount.toFixed(2)),
          description: `Bill credit | Paid: ${formatCurrency(Number(paid))} | Credit: ${formatCurrency(Number(creditAmount))}`,
          reference: result?.bill_number || null
        });
      }
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
        thankYouLine: 'Thank you for shopping with us.'
      });
      setLastShareText(shareText);
      setLastShareNumber(result?.bill_number || '');
      setLastSharePhone(payload.customer_phone || '');
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
          <label className="form-label" htmlFor="customerName">Customer Name *</label>
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
            required
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
          />
        </div>
        <div>
          <label className="form-label" htmlFor="customerPhone">Phone *</label>
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
          <Plus size={18} /> Add Product
        </button>
        <div className="total-section">
          <p>Total Payable:</p>
          <p>{formatCurrency(totalBill)}</p>
        </div>
      </div>

      <div className="form-section">
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

