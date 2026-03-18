import { useCallback } from 'react';

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

const findCustomerByName = (list = [], customerName = '') => {
  const nameKey = String(customerName || '').trim().toLowerCase();
  if (!nameKey) return null;
  return list.find(
    (entry) => String(entry?.name || '').trim().toLowerCase() === nameKey
  ) || null;
};

const findProductByItem = (list = [], item = {}) => {
  const productId = Number(item?.product_id || 0);
  if (productId > 0) {
    const byId = list.find((product) => Number(product?.id || 0) === productId);
    if (byId) return byId;
  }

  const nameKey = String(item?.product_name || '').trim().toLowerCase();
  if (!nameKey) return null;
  return list.find((product) => {
    const productName = String(product?.name || '').trim().toLowerCase();
    const sku = String(product?.sku || '').trim().toLowerCase();
    const barcode = String(product?.barcode || '').trim().toLowerCase();
    return productName === nameKey || sku === nameKey || barcode === nameKey;
  }) || null;
};

const useBillingCreateBill = ({
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
  paymentMethod,
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
}) => {
  const handleCreateBill = useCallback(async () => {
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
      payment_method: paymentMethod || 'cash',
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
      let resolvedCustomerRecord = customer;
      let itemsWithProducts = payload.items;

      if (!isOrderLinked) {
        if (!resolvedCustomerId) {
          const byName = findCustomerByName(customersList, payload.customer_name);
          resolvedCustomerId = byName?.id || null;
          resolvedCustomerRecord = byName || resolvedCustomerRecord;
        }

        if (!resolvedCustomerId && String(payload.customer_name || '').trim()) {
          const customerSearchResults = await billingApi.searchCustomers(String(payload.customer_name || '').trim());
          const matchedCustomer = findCustomerByName(customerSearchResults, payload.customer_name);
          if (matchedCustomer) {
            resolvedCustomerId = Number(matchedCustomer.id || 0) || null;
            resolvedCustomerRecord = matchedCustomer;
          }
        }

        const productUpdates = [];
        itemsWithProducts = payload.items.map((it) => {
          const cachedProduct = findProductByItem(productsList, it);
          if (cachedProduct) {
            it.product_id = cachedProduct.id;
            return it;
          }

          productUpdates.push((async () => {
            const productSearchResults = await billingApi.searchProducts(String(it.product_name || '').trim());
            const matchedProduct = findProductByItem(productSearchResults, it);
            if (matchedProduct?.id) {
              it.product_id = matchedProduct.id;
              setProductsList((prev) => mergeProductsById(prev, [matchedProduct]));
              return it;
            }

            const createdProduct = await productsApi.create({
              name: it.product_name,
              price: Number(it.mrp || 0),
              mrp: Number(it.mrp) || 0,
              uom: it.unit || 'pcs',
              category: 'Groceries',
              stock: 0
            });
            if (createdProduct?.id) {
              it.product_id = createdProduct.id;
              setProductsList((prev) => mergeProductsById(prev, [createdProduct]));
            }
            return it;
          })());
          return it;
        });

        if (productUpdates.length) {
          await Promise.all(productUpdates);
        }
      } else if (!resolvedCustomerId) {
        const byName = findCustomerByName(customersList, payload.customer_name);
        resolvedCustomerId = byName?.id || null;
        resolvedCustomerRecord = byName || resolvedCustomerRecord;
        if (!resolvedCustomerId && String(payload.customer_name || '').trim()) {
          const customerSearchResults = await billingApi.searchCustomers(String(payload.customer_name || '').trim());
          const matchedCustomer = findCustomerByName(customerSearchResults, payload.customer_name);
          if (matchedCustomer) {
            resolvedCustomerId = Number(matchedCustomer.id || 0) || null;
            resolvedCustomerRecord = matchedCustomer;
          }
        }
      }

      if (!isOrderLinked && !resolvedCustomerId) {
        alert('Please select an existing customer or click "Add Customer".');
        return;
      }

      const resolvedCustomer =
        customersList.find((entry) => Number(entry?.id || 0) === Number(resolvedCustomerId || 0))
        || resolvedCustomerRecord
        || customer;
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
  }, [
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
    paymentMethod,
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
  ]);

  return { handleCreateBill };
};

export default useBillingCreateBill;
