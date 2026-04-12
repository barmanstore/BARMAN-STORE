import { useMemo } from 'react';
import { validateAmountInput } from '../../../../shared/utils/amountExpression';
import { getPreviewLineMap } from '../../../../shared/utils/offers';
import useOfferPricingPreview from '../../../../shared/hooks/useOfferPricingPreview';
import {
  getProductDefaultPrice,
  getStockWarningMeta,
} from '../utils/billingLineItemUtils';
import { toPricingQtyFromProduct } from '../utils/billingUnitUtils';

const roundMoney = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;

const getBillingItemType = (item = {}) => {
  const productId = Number(item?.productId || item?.product_id || 0);
  if (productId > 0) return 'inventory';
  if (String(item?.type || '').trim().toLowerCase() === 'custom' || Boolean(item?.isCustom)) {
    return 'custom';
  }
  return 'inventory';
};

const getLinkedOrderRequestedQty = (item = {}) =>
  Math.max(1, Number(item?.linkedOrderRequestedQty ?? item?.requestedQty ?? item?.qty ?? 1) || 1);

const getLinkedOrderFulfilledQty = (item = {}) =>
  Math.max(
    0,
    Number(item?.linkedOrderFulfilledQty ?? item?.linkedOrderAvailableNowQty ?? item?.availableNowQty ?? item?.fulfilledQty ?? 0) || 0
  );

const getEffectiveBillingQty = ({ item = {}, linkedOrderId = 0, fulfillmentMode = 'full_now' } = {}) => {
  const enteredQty = Math.max(1, Number(item?.qty || 1) || 1);
  if (!linkedOrderId || fulfillmentMode !== 'available_now') return enteredQty;
  return Math.max(0, Math.min(enteredQty, getLinkedOrderFulfilledQty(item)));
};

const useBillingPricing = ({
  billItems,
  currentItem,
  customer,
  linkedOrderId,
  fulfillmentMode,
  selectedPaymentMethod,
  paidAmount,
  popupMode,
  getProductForLine,
}) => {
  const currentProduct = useMemo(
    () => getProductForLine(currentItem),
    [currentItem, getProductForLine]
  );

  const billingPreviewItems = useMemo(() => billItems.map((item) => {
    const product = getProductForLine(item);
    const itemType = getBillingItemType(item);
    const defaultPrice = product ? roundMoney(getProductDefaultPrice(product)) : roundMoney(item?.price || 0);
    const currentPrice = roundMoney(item?.price || 0);
    const effectiveQty = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const skipOffers = Boolean(item?.skipOffers) || itemType === 'custom' || (product ? currentPrice !== defaultPrice : false);
    return {
      client_item_id: item?.id,
      product_id: Number(item?.productId || item?.product_id || 0) || null,
      product_name: String(item?.name || item?.product_name || '').trim(),
      quantity: effectiveQty,
      qty: effectiveQty,
      unit: String(item?.unit || 'pcs').trim() || 'pcs',
      item_type: itemType === 'custom' ? 'custom' : 'catalog',
      unit_price_override: skipOffers ? currentPrice : undefined,
      manual_discount: Math.max(0, Number(item?.disc || item?.discount || 0) || 0),
      skip_offers: skipOffers,
    };
  }), [billItems, fulfillmentMode, getProductForLine, linkedOrderId]);

  const {
    preview: billingPricingPreview,
    loading: billingPricingLoading,
    error: billingPricingError,
  } = useOfferPricingPreview({
    items: billingPreviewItems,
    context: 'billing',
    offerContext: {
      customer_user_id: Number(customer?.id || 0) || null,
      exclude_order_id: Number(linkedOrderId || 0) || null,
    },
    enabled: billItems.length > 0,
  });

  const billingPricingLineMap = useMemo(
    () => getPreviewLineMap(billingPricingPreview),
    [billingPricingPreview]
  );

  const localSubtotalAmount = useMemo(() => roundMoney(billItems.reduce((sum, item) => {
    const priceNum = Number(item.price) || 0;
    const qtyNum = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const requestedQty = getLinkedOrderRequestedQty(item);
    const qtyRatio = requestedQty > 0 ? (qtyNum / requestedQty) : 0;
    const product = getProductForLine(item);
    const pricingQty = toPricingQtyFromProduct(qtyNum, item.unit, product);
    if (Number(item?.prefilledLineSubtotal || 0) > 0 && linkedOrderId) {
      return sum + roundMoney(Number(item.prefilledLineSubtotal || 0) * qtyRatio);
    }
    return sum + (priceNum * pricingQty);
  }, 0)), [billItems, fulfillmentMode, getProductForLine, linkedOrderId]);

  const localTotalDiscount = useMemo(() => roundMoney(billItems.reduce((sum, item) => {
    const priceNum = Number(item.price) || 0;
    const qtyNum = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const requestedQty = getLinkedOrderRequestedQty(item);
    const qtyRatio = requestedQty > 0 ? (qtyNum / requestedQty) : 0;
    const product = getProductForLine(item);
    const pricingQty = toPricingQtyFromProduct(qtyNum, item.unit, product);
    const discNum = Number(item.disc) || 0;
    if (Number(item?.prefilledTotalDiscount || 0) > 0 && linkedOrderId) {
      return sum + roundMoney(Number(item.prefilledTotalDiscount || 0) * qtyRatio);
    }
    if (item.discType === 'percentage') {
      const validDiscPercent = Math.min(100, Math.max(0, discNum));
      return sum + (priceNum * pricingQty * validDiscPercent) / 100;
    }
    return sum + Math.min(priceNum * pricingQty, Math.max(0, discNum));
  }, 0)), [billItems, fulfillmentMode, getProductForLine, linkedOrderId]);

  const localTotalBill = useMemo(
    () => roundMoney(Math.max(0, localSubtotalAmount - localTotalDiscount)),
    [localSubtotalAmount, localTotalDiscount]
  );

  const subtotalAmount = Number.isFinite(Number(billingPricingPreview?.summary?.base_subtotal))
    ? roundMoney(Number(billingPricingPreview.summary.base_subtotal))
    : localSubtotalAmount;
  const totalDiscount = Number.isFinite(Number(billingPricingPreview?.summary?.discount_total))
    ? roundMoney(Number(billingPricingPreview.summary.discount_total))
    : localTotalDiscount;
  const totalBill = Number.isFinite(Number(billingPricingPreview?.summary?.net_subtotal))
    ? roundMoney(Number(billingPricingPreview.summary.net_subtotal))
    : localTotalBill;

  const paidAmountEvaluation = useMemo(
    () => validateAmountInput(paidAmount, { min: 0, max: totalBill }),
    [paidAmount, totalBill]
  );
  const hasPaidAmountInput = String(paidAmount ?? '').trim() !== '';
  const paidAmountWarning = hasPaidAmountInput && !paidAmountEvaluation.valid
    ? (paidAmountEvaluation.message || 'Paid amount is invalid.')
    : '';
  const paidResolved = paidAmountEvaluation.valid ? Number(paidAmountEvaluation.value) : 0;
  const paidClamped = roundMoney(Math.max(0, Math.min(paidResolved, Number(totalBill || 0))));
  const creditAmount = roundMoney(Math.max(0, Number(totalBill) - paidClamped));
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
  const activeLineItemsCount = billItems.length;
  const paymentStatusLabel = creditAmount > 0
    ? (paidClamped > 0 ? 'Partial' : 'Due')
    : 'Paid';

  const lowStockWarning = useMemo(() => {
    if (!currentProduct) return null;
    const pricingQty = toPricingQtyFromProduct(currentItem?.qty, currentItem?.unit, currentProduct);
    return getStockWarningMeta(currentProduct, pricingQty);
  }, [currentItem?.qty, currentItem?.unit, currentProduct]);

  const isManualPrice = useMemo(() => {
    if (!currentProduct || getBillingItemType(currentItem) !== 'inventory') return false;
    return roundMoney(currentItem?.price) !== roundMoney(getProductDefaultPrice(currentProduct));
  }, [currentItem, currentProduct]);

  const billDisplayItems = useMemo(() => billItems.map((item) => {
    const product = getProductForLine(item);
    const effectiveQty = getEffectiveBillingQty({
      item,
      linkedOrderId,
      fulfillmentMode,
    });
    const pricingQty = toPricingQtyFromProduct(effectiveQty, item.unit, product);
    const isCustomItem = getBillingItemType(item) === 'custom';
    const previewLine = billingPricingLineMap.get(String(item?.id)) || null;
    const fallbackOfferDiscount = Math.max(0, Number(item?.prefilledOfferDiscount || 0));
    const fallbackManualDiscount = Math.max(0, Number(item?.prefilledManualDiscount || item?.disc || 0));
    const fallbackTotalDiscount = Math.max(
      0,
      Number(item?.prefilledTotalDiscount || (fallbackOfferDiscount + fallbackManualDiscount) || 0)
    );
    const fallbackOfferLabel = String(item?.prefilledOfferLabel || '').trim();
    const resolvedAmount = effectiveQty <= 0 && !previewLine
      ? 0
      : Number(previewLine?.line_total ?? item.amount ?? 0);
    const stockWarning = isCustomItem ? null : getStockWarningMeta(product, pricingQty);
    const cost = Number(product?.buy_price ?? product?.cost_price ?? product?.purchase_price ?? 0);
    const profitValue = Number.isFinite(cost) && cost > 0
      ? resolvedAmount - (cost * pricingQty)
      : null;
    const priceUnit =
      String(product?.base_unit || product?.uom || product?.unit || item.unit || 'pcs').trim() || 'pcs';
    const requestedQty = getLinkedOrderRequestedQty(item);
    const linkedPendingQty = Math.max(0, Number(item?.linkedOrderPendingQty || 0));
    const qtyRatio = requestedQty > 0 ? (effectiveQty / requestedQty) : 0;

    return {
      ...item,
      amount: resolvedAmount,
      effectiveQty,
      requestedQty,
      linkedPendingQty,
      isPartialLinkedBilling: Boolean(
        linkedOrderId
        && fulfillmentMode === 'available_now'
        && requestedQty > effectiveQty
      ),
      isCustomItem,
      isManualPrice: !isCustomItem && product
        ? roundMoney(item?.price) !== roundMoney(getProductDefaultPrice(product))
        : false,
      stockWarning,
      profitValue,
      priceUnit,
      lineSubtotal: Number(
        previewLine?.line_subtotal
        ?? (Number(item?.prefilledLineSubtotal || 0) > 0 ? roundMoney(Number(item.prefilledLineSubtotal || 0) * qtyRatio) : 0)
      ),
      offerDiscount: Number(previewLine?.auto_offer_discount ?? roundMoney(fallbackOfferDiscount * qtyRatio)),
      manualDiscount: Number(previewLine?.manual_discount ?? roundMoney(fallbackManualDiscount * qtyRatio)),
      totalDiscount: Number(previewLine?.line_discount_total ?? roundMoney(fallbackTotalDiscount * qtyRatio)),
      appliedOfferLabel: String(previewLine?.best_offer_label || fallbackOfferLabel).trim(),
    };
  }), [billItems, billingPricingLineMap, fulfillmentMode, getProductForLine, linkedOrderId]);

  const createBillConfirmationSignature = useMemo(() => JSON.stringify({
    customerId: Number(customer?.id || 0) || null,
    customerName: String(customer?.name || '').trim(),
    effectivePaymentMethod,
    paidClamped,
    creditAmount,
    totalBill,
    items: billItems.map((item) => ({
      id: item?.id,
      type: item?.type,
      productId: item?.productId,
      name: item?.name,
      qty: item?.qty,
      price: item?.price,
      disc: item?.disc,
      amount: item?.amount,
    })),
  }), [
    billItems,
    creditAmount,
    customer?.id,
    customer?.name,
    effectivePaymentMethod,
    paidClamped,
    totalBill,
  ]);

  const billingDraftDirty = Boolean(
    popupMode
    && (
      String(customer?.name || '').trim()
      || String(customer?.phone || '').trim()
      || String(customer?.email || '').trim()
      || String(customer?.address || '').trim()
      || billItems.length > 0
      || String(currentItem?.name || '').trim()
      || Number(currentItem?.price || 0) > 0
      || Number(currentItem?.disc || 0) > 0
      || Math.max(1, Number(currentItem?.qty || 1)) !== 1
      || String(currentItem?.unit || 'pcs').trim().toLowerCase() !== 'pcs'
      || Number(paidAmount || 0) > 0
      || String(selectedPaymentMethod || 'cash').trim().toLowerCase() !== 'cash'
      || String(fulfillmentMode || 'available_now').trim().toLowerCase() !== 'available_now'
      || Number(linkedOrderId || 0) > 0
      || String(currentItem?.name || '').trim()
    )
  );

  return {
    billingPricingLoading,
    billingPricingError,
    subtotalAmount,
    totalDiscount,
    totalBill,
    paidAmountEvaluation,
    paidAmountWarning,
    paidClamped,
    creditAmount,
    effectivePaymentMethod,
    isOrderLinked,
    activeLineItemsCount,
    paymentStatusLabel,
    lowStockWarning,
    isManualPrice,
    billDisplayItems,
    createBillConfirmationSignature,
    billingDraftDirty,
    currentProduct,
    currentItem,
  };
};

export default useBillingPricing;
