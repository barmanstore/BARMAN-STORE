import { useCallback, useRef } from 'react';
import {
  applyPurchaseDraftFieldChange,
  applyPurchaseDraftLastPurchaseSuggestion,
  applyPurchaseDraftProductSelection,
  buildPurchaseOrderSavePayload,
  clearPurchaseDraftProductSelection,
  getLastPurchaseSuggestionPreserveFlags,
  getPurchaseDraftItemSourceFlags,
  preparePurchaseOrderSubmission,
} from '../utils/orderDrafts';

const usePurchaseOrderDetailHandlers = ({
  orderDetail,
  orderDetailDraft,
  setOrderDetail,
  setOrderDetailDraft,
  setShowOrderDetail,
  setOrderDetailLoading,
  setOrderDetailEditMode,
  setOrderDetailSaving,
  setError,
  setSuccess,
  purchaseOrdersApi,
  loadLastPurchaseSuggestion,
  products,
  toDateInputValue,
  getProductSearchLabel,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  toNumber,
  calculateOrderItem,
  calculateOrderTotals,
  createEmptyOrderItem,
  isPoEditable,
  resolveProductByInput,
  findProductForItem,
  getPurchaseRequestErrorMessage,
  fetchOrders,
  fetchOperationsSummary,
  refreshSupplierRegisteredProducts,
}) => {
  const detailDraftHydrationTokenRef = useRef(0);

  const buildOrderDetailDraft = useCallback((order) => {
    if (!order) return null;
    return {
      planned_order_date: toDateInputValue(order.planned_order_date || order.expected_delivery),
      expected_delivery: toDateInputValue(order.expected_delivery),
      strict_due_date: toDateInputValue(order.strict_due_date),
      notes: order.notes || '',
      strict_due_note: order.strict_due_note || '',
      items: (order.items || []).map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        const sourceFlags = getPurchaseDraftItemSourceFlags(item);
        return {
          id: item.id,
          product_id: item.product_id ? String(item.product_id) : '',
          product_query: product ? getProductSearchLabel(product) : (item.product_name || ''),
          product_name: item.product_name || '',
          quantity: Math.max(1, toNumber(item.quantity)),
          uom: resolvePurchaseUnitForProduct(product, item.uom || product?.base_unit || product?.uom || 'pcs'),
          rate: toNumber(item.rate ?? item.unit_price),
          unit_price: toNumber(item.unit_price ?? item.rate),
          rate_warning_acknowledged: true,
          gst_rate: normalizeGstRateOption(item.gst_rate),
          discount_type: item.discount_type === 'fixed' ? 'fixed' : 'percent',
          discount_value: Math.max(0, toNumber(item.discount_value)),
          discount_warning_acknowledged: true,
          reference_rate: Math.max(0, toNumber(item.reference_rate ?? item.rate ?? item.unit_price)),
          reference_rate_source: String(item.reference_rate_source || '').trim(),
          last_purchase_hint: '',
          last_purchase_rate: 0,
          last_purchase_distributor_name: '',
          last_purchase_created_at: '',
          last_purchase_po_number: '',
          row_source: sourceFlags.rowSource,
          po_item_source: sourceFlags.poItemSource,
          po_item_locked: sourceFlags.poItemLocked,
          taxable_value: toNumber(item.taxable_value),
          tax_amount: toNumber(item.tax_amount),
          line_total: toNumber(item.line_total ?? item.total),
        };
      }),
    };
  }, [products, toDateInputValue, getProductSearchLabel, resolvePurchaseUnitForProduct, normalizeGstRateOption, toNumber]);

  const closeOrderDetail = useCallback(() => {
    setShowOrderDetail(false);
    setOrderDetail(null);
    setOrderDetailEditMode(false);
    setOrderDetailSaving(false);
    setOrderDetailDraft(null);
  }, [
    setShowOrderDetail,
    setOrderDetail,
    setOrderDetailEditMode,
    setOrderDetailSaving,
    setOrderDetailDraft,
  ]);

  const handleOrderDetailFieldChange = useCallback((field, value) => {
    setOrderDetailDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, [setOrderDetailDraft]);

  const handleOrderDetailItemChange = useCallback((index, field, value) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const current = items[index];
      if (!current) return prev;
      items[index] = applyPurchaseDraftFieldChange({
        item: current,
        field,
        value,
        products,
        findProductForItem,
        resolvePurchaseUnitForProduct,
        normalizeGstRateOption,
        toNumber,
      });
      return { ...prev, items };
    });
  }, [
    setOrderDetailDraft,
    products,
    findProductForItem,
    resolvePurchaseUnitForProduct,
    normalizeGstRateOption,
    toNumber,
  ]);

  const handleOrderDetailProductInputChange = useCallback(async (index, value) => {
    const match = resolveProductByInput(value);
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      const current = items[index];
      if (!current) return prev;

      items[index] = match
        ? {
            ...applyPurchaseDraftProductSelection({
              item: current,
              product: match,
              getProductSearchLabel,
              resolvePurchaseUnitForProduct,
              toNumber,
            }),
            row_source: 'manual',
            po_item_source: 'manual_added',
            po_item_locked: false,
          }
        : {
            ...clearPurchaseDraftProductSelection({
              item: current,
              query: value,
            }),
            row_source: 'manual',
            po_item_source: 'manual_added',
            po_item_locked: false,
          };
      return { ...prev, items };
    });
    if (!match) return;

    try {
      const suggestion = await loadLastPurchaseSuggestion(String(match.id));
      if (!suggestion) return;

      setOrderDetailDraft((prev) => {
        if (!prev) return prev;
        const items = [...(prev.items || [])];
        const current = items[index];
        if (!current || String(current.product_id || '') !== String(match.id)) return prev;
        const preserveFlags = getLastPurchaseSuggestionPreserveFlags({
          item: current,
          normalizeGstRateOption,
          toNumber,
        });
        items[index] = applyPurchaseDraftLastPurchaseSuggestion({
          item: current,
          product: match,
          suggestion,
          resolvePurchaseUnitForProduct,
          normalizeGstRateOption,
          toNumber,
          ...preserveFlags,
        });
        return { ...prev, items };
      });
    } catch (_) {
      // keep product defaults when suggestion API is unavailable
    }
  }, [
    setOrderDetailDraft,
    resolveProductByInput,
    getProductSearchLabel,
    resolvePurchaseUnitForProduct,
    normalizeGstRateOption,
    toNumber,
    loadLastPurchaseSuggestion,
  ]);

  const hydrateOrderDetailDraftSuggestions = useCallback(async (draft) => {
    if (!draft?.items?.length) return;

    const token = detailDraftHydrationTokenRef.current + 1;
    detailDraftHydrationTokenRef.current = token;

    const suggestedItems = await Promise.all((draft.items || []).map(async (item) => {
      const productId = String(item?.product_id || '').trim();
      if (!productId) return null;
      try {
        const suggestion = await loadLastPurchaseSuggestion(productId);
        if (!suggestion) return null;
        const product = products.find((entry) => String(entry.id) === productId) || null;
        return { productId, product, suggestion };
      } catch (_) {
        return null;
      }
    }));

    if (detailDraftHydrationTokenRef.current !== token) return;

    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      const items = [...(prev.items || [])];
      let changed = false;

      suggestedItems.forEach((entry, index) => {
        if (!entry) return;
        const current = items[index];
        if (!current || String(current.product_id || '').trim() !== entry.productId) return;
        items[index] = applyPurchaseDraftLastPurchaseSuggestion({
          item: current,
          product: entry.product,
          suggestion: entry.suggestion,
          resolvePurchaseUnitForProduct,
          normalizeGstRateOption,
          toNumber,
          preserveRate: true,
          preserveGst: true,
          preserveUom: true,
        });
        changed = true;
      });

      return changed ? { ...prev, items } : prev;
    });
  }, [
    loadLastPurchaseSuggestion,
    normalizeGstRateOption,
    products,
    resolvePurchaseUnitForProduct,
    setOrderDetailDraft,
    toNumber,
  ]);

  const handleOrderDetailItemAdd = useCallback(() => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...(prev.items || []),
          {
            ...createEmptyOrderItem(),
            quantity: 1,
            gst_rate: normalizeGstRateOption(5),
            row_source: 'manual',
            po_item_source: 'manual_added',
            po_item_locked: false,
          },
        ],
      };
    });
  }, [setOrderDetailDraft, createEmptyOrderItem, normalizeGstRateOption]);

  const handleOrderDetailItemRemove = useCallback((index) => {
    setOrderDetailDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: (prev.items || []).filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }, [setOrderDetailDraft]);

  const openOrderDetailEditMode = useCallback(() => {
    if (!orderDetail || !isPoEditable(orderDetail)) return;
    const draft = buildOrderDetailDraft(orderDetail);
    setOrderDetailDraft(draft);
    hydrateOrderDetailDraftSuggestions(draft);
    setOrderDetailEditMode(true);
  }, [
    orderDetail,
    isPoEditable,
    buildOrderDetailDraft,
    hydrateOrderDetailDraftSuggestions,
    setOrderDetailDraft,
    setOrderDetailEditMode,
  ]);

  const handleOrderDetailSave = useCallback(async () => {
    if (!orderDetail || !orderDetailDraft) return;

    try {
      setError('');
      setOrderDetailSaving(true);
      const submission = preparePurchaseOrderSubmission({
        items: orderDetailDraft.items || [],
        products,
        findProductForItem,
        calculateOrderItem,
        calculateOrderTotals,
      });
      if (submission.error) {
        setError(
          submission.error === 'Please add at least one item'
            ? 'Please keep at least one valid item in the purchase order'
            : submission.error
        );
        return;
      }

      const payload = buildPurchaseOrderSavePayload({
        distributorId: orderDetail.distributor_id,
        plannedOrderDate: orderDetailDraft.planned_order_date || orderDetail.planned_order_date || null,
        expectedDelivery: orderDetailDraft.expected_delivery || null,
        strictDueDate: orderDetailDraft.strict_due_date || null,
        strictDueNote: orderDetailDraft.strict_due_note || '',
        notes: orderDetailDraft.notes || '',
        calculatedItems: submission.calculatedItems,
        totals: submission.totals,
      });
      await purchaseOrdersApi.update(orderDetail.id, payload);
      const [refreshedOrder] = await Promise.all([
        purchaseOrdersApi.getById(orderDetail.id),
        typeof refreshSupplierRegisteredProducts === 'function' && orderDetail?.supplier_id
          ? refreshSupplierRegisteredProducts(orderDetail.supplier_id)
          : Promise.resolve([]),
      ]);
      setOrderDetail(refreshedOrder);
      setOrderDetailDraft(buildOrderDetailDraft(refreshedOrder));
      setOrderDetailEditMode(false);
      setSuccess('Purchase order updated.');
      await Promise.all([
        fetchOrders(),
        typeof fetchOperationsSummary === 'function' ? fetchOperationsSummary() : Promise.resolve(),
      ]);
    } catch (err) {
      setError(getPurchaseRequestErrorMessage(err, 'Failed to update purchase order'));
    } finally {
      setOrderDetailSaving(false);
    }
  }, [
    orderDetail,
    orderDetailDraft,
    setError,
    setOrderDetailSaving,
    purchaseOrdersApi,
    setOrderDetail,
    setOrderDetailDraft,
    buildOrderDetailDraft,
    setOrderDetailEditMode,
    setSuccess,
    fetchOrders,
    fetchOperationsSummary,
    getPurchaseRequestErrorMessage,
    products,
    findProductForItem,
    calculateOrderItem,
    calculateOrderTotals,
    refreshSupplierRegisteredProducts,
  ]);

  const handleViewOrder = useCallback(async (orderId) => {
    try {
      setShowOrderDetail(true);
      setOrderDetail(null);
      setOrderDetailLoading(true);
      setOrderDetailEditMode(false);
      setOrderDetailDraft(null);
      const order = await purchaseOrdersApi.getById(orderId);
      const draft = buildOrderDetailDraft(order);
      setOrderDetail(order);
      setOrderDetailDraft(draft);
      hydrateOrderDetailDraftSuggestions(draft);
    } catch (err) {
      setError('Failed to load order details');
      setShowOrderDetail(false);
    } finally {
      setOrderDetailLoading(false);
    }
  }, [
    setShowOrderDetail,
    setOrderDetail,
    setOrderDetailLoading,
    setOrderDetailEditMode,
    setOrderDetailDraft,
    purchaseOrdersApi,
    buildOrderDetailDraft,
    hydrateOrderDetailDraftSuggestions,
    setError,
  ]);

  return {
    buildOrderDetailDraft,
    closeOrderDetail,
    handleOrderDetailFieldChange,
    handleOrderDetailItemChange,
    handleOrderDetailProductInputChange,
    handleOrderDetailItemAdd,
    handleOrderDetailItemRemove,
    openOrderDetailEditMode,
    handleOrderDetailSave,
    handleViewOrder,
  };
};

export default usePurchaseOrderDetailHandlers;
