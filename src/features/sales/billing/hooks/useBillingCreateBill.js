import { useCallback } from 'react';

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
