import { useCallback } from 'react';

const PRODUCT_CACHE_LIMIT = 160;
const normalizeLookupKey = (value = '') => String(value || '').trim().toLowerCase();
const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;

const mergeProductsById = (currentList = [], nextList = [], maxItems = PRODUCT_CACHE_LIMIT) => {
  const merged = [];
  const seen = new Set();

  [...nextList, ...currentList].forEach((product) => {
    const id = Number(product?.id || 0);
    if (id <= 0 || seen.has(id)) return;
    seen.add(id);
    merged.push(product);
  });

  return merged.slice(0, maxItems);
};

const findCustomerByName = (list = [], customerName = '') => {
  const nameKey = String(customerName || '').trim().toLowerCase();
  if (!nameKey) return null;
  return list.find(
    (entry) => String(entry?.name || '').trim().toLowerCase() === nameKey
  ) || null;
};

const findCustomerById = (list = [], customerId = null) => {
  const id = Number(customerId || 0);
  if (id <= 0) return null;
  return list.find((entry) => Number(entry?.id || 0) === id) || null;
};

const isCustomBillingItem = (item = {}) =>
  String(item?.item_type || '').trim().toLowerCase() === 'custom' || Boolean(item?.is_custom);

const findProductByItem = (list = [], item = {}) => {
  const productId = Number(item?.product_id || 0);
  if (productId > 0) {
    const byId = list.find((product) => Number(product?.id || 0) === productId);
    if (byId) return byId;
  }

  const lookupKey = normalizeLookupKey(item?.product_name);
  if (!lookupKey) return null;

  const barcodeMatches = list.filter((product) =>
    normalizeLookupKey(product?.barcode) === lookupKey
  );
  if (barcodeMatches.length > 0) {
    return barcodeMatches.length === 1 ? barcodeMatches[0] : null;
  }

  const skuMatches = list.filter((product) =>
    normalizeLookupKey(product?.sku) === lookupKey
  );
  if (skuMatches.length > 0) {
    return skuMatches.length === 1 ? skuMatches[0] : null;
  }

  const nameMatches = list.filter((product) =>
    normalizeLookupKey(product?.name) === lookupKey
  );
  return nameMatches.length === 1 ? nameMatches[0] : null;
};

const useBillingCreateBill = ({
  billingApi,
  creditApi,
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
  setSelectedPaymentMethod,
  setCustomer,
  setItems,
  setPaidAmount,
  getProductForLine,
  resolveLineUnitForProduct,
  buildBillShareText,
  info,
  onResetEntry,
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
        .filter((it) => {
          const lineName = String(it?.name || it?.product_name || '').trim();
          if (!lineName) return false;
          if (isOrderLinked) {
            return Boolean(
              Number(it?.linkedOrderItemId || it?.linked_order_item_id || 0)
              || Math.max(0, Number(it?.qty || 0)) > 0
            );
          }
          return Number(it.amount) > 0;
        })
        .map((it) => {
          const itemType = String(it?.type || '').trim().toLowerCase() === 'custom' || Boolean(it?.isCustom)
            ? 'custom'
            : 'inventory';
          const explicitProductId = Number(it?.productId || it?.product_id || 0) || null;
          const product = explicitProductId ? getProductForLine(it) : null;
          const normalizedUnit = resolveLineUnitForProduct(product, it.unit);
          const skipOffers = itemType === 'custom'
            || (product ? roundMoney(it?.price) !== roundMoney(product?.price) : false);
          return {
            client_item_id: it?.id || null,
            linked_order_item_id: Number(it?.linkedOrderItemId || it?.linked_order_item_id || 0) || null,
            item_type: itemType,
            is_custom: itemType === 'custom',
            product_id: explicitProductId,
            product_name: String(it?.name || it?.product_name || '').trim(),
            mrp: Number(it.price) || 0,
            qty: Number(it.qty) || 0,
            ...(normalizedUnit ? { unit: normalizedUnit } : {}),
            discount: Number(it.disc) || 0,
            skip_offers: skipOffers,
            amount: Number(it.amount) || 0
          };
        })
    };

    try {
      setIsSubmitting(true);

      // Keep order-linked billing minimal: backend binds to order and skips stock checks.
      let resolvedCustomerId = Number(payload.customer_id || 0) || null;
      let resolvedCustomerRecord = findCustomerById(customersList, resolvedCustomerId) || customer;
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

        if (!resolvedCustomerId && Number(payload.credit_amount || 0) > 0) {
          throw new Error('Select or save a customer before creating a credit bill.');
        }

        const productUpdates = [];
        const productSearchRequests = new Map();
        itemsWithProducts = payload.items.map((it) => {
          if (isCustomBillingItem(it)) {
            return { ...it, product_id: null };
          }

          if (Number(it?.product_id || 0) > 0) {
            return it;
          }

          const cachedProduct = findProductByItem(productsList, it);
          if (cachedProduct) {
            return { ...it, product_id: cachedProduct.id };
          }

          const nextItem = { ...it, product_id: null };
          productUpdates.push((async () => {
            const productName = String(nextItem.product_name || '').trim();
            const searchKey = normalizeLookupKey(productName);
            if (!searchKey) {
              return nextItem;
            }
            let searchRequest = productSearchRequests.get(searchKey);
            if (!searchRequest) {
              searchRequest = billingApi.searchProducts(
                productName,
                undefined,
                { limit: 10, exactOnly: true }
              );
              productSearchRequests.set(searchKey, searchRequest);
            }
            const productSearchResults = await searchRequest;
            const matchedProduct = findProductByItem(productSearchResults, nextItem);
            if (matchedProduct?.id) {
              nextItem.product_id = matchedProduct.id;
              setProductsList((prev) => mergeProductsById(prev, [matchedProduct]));
              return nextItem;
            }
            return nextItem;
          })());
          return nextItem;
        });

        if (productUpdates.length) {
          await Promise.all(productUpdates);
        }
      }

      const unresolvedInventoryItems = itemsWithProducts.filter((it) =>
        !isCustomBillingItem(it) && !Number(it?.product_id || 0)
      );
      if (unresolvedInventoryItems.length > 0) {
        const unresolvedLabels = unresolvedInventoryItems
          .map((it, index) => String(it?.product_name || `Item ${index + 1}`).trim())
          .filter(Boolean);
        const previewLabel = unresolvedLabels.slice(0, 3).join(', ');
        const extraCount = Math.max(0, unresolvedLabels.length - 3);
        const details = previewLabel
          ? `: ${previewLabel}${extraCount > 0 ? ` and ${extraCount} more` : ''}`
          : '.';
        throw new Error(
          `Select each inventory product from search or mark it as custom before creating the bill${details}`
        );
      }

      const resolvedCustomer =
        findCustomerById(customersList, resolvedCustomerId)
        || resolvedCustomerRecord
        || customer;
      payload.customer_id = resolvedCustomerId;
      payload.customer_name = String(resolvedCustomer?.name || payload.customer_name || '').trim()
        || (isOrderLinked ? 'Customer' : 'Walk-in');
      payload.customer_email = resolvedCustomer?.email || payload.customer_email || null;
      payload.customer_phone = resolvedCustomer?.phone || payload.customer_phone || null;
      payload.customer_address = resolvedCustomer?.address || payload.customer_address || null;
      payload.items = itemsWithProducts;

      const result = await billingApi.createBill(payload);
      let persistedBill = null;
      try {
        const billLookupKey = result?.bill_id || result?.bill_number;
        if (billLookupKey) {
          persistedBill = await billingApi.getById(billLookupKey);
        }
      } catch (_) {
        // Keep the success flow resilient; fall back to the local payload for sharing.
      }

      const shareSource = persistedBill && typeof persistedBill === 'object'
        ? persistedBill
        : {
          bill_number: result?.bill_number,
          created_at: new Date().toISOString(),
          customer_id: payload.customer_id,
          customer_name: payload.customer_name,
          customer_email: payload.customer_email,
          customer_phone: payload.customer_phone,
          customer_address: payload.customer_address,
          items: payload.items,
          total_amount: payload.total_amount,
          paid_amount: payload.paid_amount,
          credit_amount: payload.credit_amount,
          payment_status: payload.payment_status,
        };

      const shareCustomerId = Number(shareSource?.customer_id || 0) || null;
      const shareTotalAmount = shareSource?.total_amount ?? payload.total_amount;
      const sharePaidAmount = shareSource?.paid_amount ?? payload.paid_amount;
      const shareCreditAmount = shareSource?.credit_amount ?? payload.credit_amount;
      const shareItems = Array.isArray(shareSource?.items) ? shareSource.items : payload.items;
      let currentTotalCredit = Number(shareCreditAmount || 0);
      if (shareCustomerId) {
        try {
          const balanceData = await creditApi.getBalance(shareCustomerId);
          currentTotalCredit = Number(balanceData?.balance || 0);
        } catch (_) {
          // Keep bill flow resilient; fall back to this bill's credit amount.
        }
      }
      const shareText = buildBillShareText({
        companyTitle: info.TITLE || 'BARMAN STORE',
        billNumber: shareSource?.bill_number || result?.bill_number,
        createdAt: shareSource?.created_at || new Date().toISOString(),
        customerName: shareSource?.customer_name || payload.customer_name,
        customerPhone: shareSource?.customer_phone || payload.customer_phone,
        customerEmail: shareSource?.customer_email || payload.customer_email,
        customerAddress: shareSource?.customer_address || payload.customer_address,
        items: shareItems,
        totalAmount: shareTotalAmount,
        paidAmount: sharePaidAmount,
        creditAmount: shareCreditAmount,
        currentTotalCredit,
        paymentStatus: shareSource?.payment_status || payload.payment_status,
        onlineStoreUrl: info.ONLINE_STORE_URL,
        thankYouLine: 'আমাৰ ওচৰত বজাৰ কৰাৰ বাবে ধন্যবাদ।'
      });
      setLastShareText(shareText);
      setLastShareNumber(shareSource?.bill_number || result?.bill_number || '');
      setLastSharePhone(shareSource?.customer_phone || payload.customer_phone || '');
      setPrefillSummary('');
      if (isOrderLinked) {
        setLinkedOrderId(0);
        setFulfillmentMode('available_now');
      }
      alert('Bill created successfully.');
      setSelectedPaymentMethod('cash');
      setCustomer({ id: null, name: '', email: '', phone: '', address: '' });
      setItems([]);
      setPaidAmount(0);
      if (typeof onResetEntry === 'function') {
        onResetEntry();
      }
    } catch (err) {
      console.error('Error creating bill:', err);
      alert(`Failed to create bill: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    billingApi,
    creditApi,
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
    setSelectedPaymentMethod,
    setCustomer,
    setItems,
    setPaidAmount,
    getProductForLine,
    resolveLineUnitForProduct,
    buildBillShareText,
    info,
    onResetEntry,
  ]);

  return { handleCreateBill };
};

export default useBillingCreateBill;
