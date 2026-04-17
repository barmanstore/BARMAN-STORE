import { useCallback } from 'react';
import { DOMAINS, invalidateDomain } from '../../../../shared/services/invalidation';
import {
  findActivePurchaseProduct,
  isActivePurchaseProduct,
} from '../utils/productSearch';
import {
  applyPurchaseDraftLastPurchaseSuggestion,
  buildPurchaseOrderSavePayload,
  getLastPurchaseSuggestionPreserveFlags,
  getPurchaseDraftItemSourceFlags,
  preparePurchaseOrderSubmission,
} from '../utils/orderDrafts';

const usePurchaseOrderFormHandlers = ({
  setFilters,
  setActiveSubTab,
  getDefaultOrderFormData,
  setOrderFormData,
  setEditingOrderId,
  setOrderFullMode,
  setOrderReviewMode,
  setOrderSubmitting,
  setSuccess,
  setLastSavedOrderSummary,
  setLoadingDistributorItems,
  setActivePoProductField,
  setShowOrderForm,
  orderSubmitLockRef,
  orderSubmitting,
  orderFormData,
  distributors,
  suppliers,
  products,
  buildOrderDraftItem,
  createEmptyOrderItem,
  toNumber,
  calculateOrderItem,
  calculateOrderTotals,
  findProductForItem,
  purchaseOrdersApi,
  user,
  editingOrderId,
  orderFormClientRequestId,
  setOrderFormClientRequestId,
  createClientRequestId,
  setError,
  getPurchaseRequestErrorMessage,
  fetchOrders,
  fetchOperationsSummary,
  isPoEditable,
  toDateInputValue,
  getDistributorProductHistoryEntry,
  getLatestProductHistoryEntry,
  loadLastPurchaseSuggestion,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  onOrderSaved,
  refreshSupplierRegisteredProducts,
}) => {
  const handleFilterChange = useCallback((input) => {
    if (input && !input.target && typeof input === 'object') {
      setFilters((prev) => ({ ...prev, ...input }));
      return;
    }
    const { name, value } = input.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  }, [setFilters]);

  const buildSuggestedProductSnapshot = useCallback((item = {}) => {
    const rawSnapshot = item?.product_snapshot && typeof item.product_snapshot === 'object'
      ? item.product_snapshot
      : null;
    if (!rawSnapshot && !item?.product_id && !item?.product_name) return null;
    return {
      id: rawSnapshot?.id ?? item?.product_id ?? '',
      name: String(rawSnapshot?.name || item?.product_name || '').trim(),
      price: toNumber(rawSnapshot?.price ?? item?.reference_rate ?? item?.unit_price ?? item?.rate ?? 0),
      uom: String(rawSnapshot?.uom || item?.uom || 'pcs').trim() || 'pcs',
      base_unit: String(rawSnapshot?.base_unit || item?.base_unit || item?.uom || 'pcs').trim() || 'pcs',
      conversion_factor: toNumber(rawSnapshot?.conversion_factor ?? item?.conversion_factor ?? 1) || 1,
      purchase_pack_size: toNumber(rawSnapshot?.purchase_pack_size ?? item?.purchase_pack_size ?? 0),
      is_active: rawSnapshot?.is_active ?? item?.is_active ?? null,
    };
  }, [toNumber]);

  const resolveSuggestedProduct = useCallback((item = {}) => {
    const rawSnapshot = item?.product_snapshot && typeof item.product_snapshot === 'object'
      ? item.product_snapshot
      : null;
    const productId = String(rawSnapshot?.id ?? item?.product_id ?? '').trim();
    const product = findActivePurchaseProduct(products, productId);
    const snapshot = buildSuggestedProductSnapshot(item);
    if (product) {
      if (!snapshot) return product;
      return {
        ...product,
        ...snapshot,
        id: product.id,
        name: product.name || snapshot.name,
      };
    }
    const rawProduct = productId
      ? (Array.isArray(products) ? products : []).find((entry) => String(entry?.id || '').trim() === productId) || null
      : null;
    if (rawProduct && !isActivePurchaseProduct(rawProduct)) return null;
    if (snapshot && (snapshot.is_active === false || Number(snapshot.is_active || 1) === 0)) return null;
    return snapshot;
  }, [buildSuggestedProductSnapshot, products]);

  const resetOrderForm = useCallback(() => {
    setOrderFormData(getDefaultOrderFormData());
    setEditingOrderId(null);
    setOrderFullMode(false);
    setOrderReviewMode(false);
    setOrderSubmitting(false);
    setLoadingDistributorItems(false);
    setActivePoProductField({ mode: 'entry', index: null });
    orderSubmitLockRef.current = false;
    setOrderFormClientRequestId(createClientRequestId('po'));
  }, [
    setOrderFormData,
    getDefaultOrderFormData,
    setEditingOrderId,
    setOrderFullMode,
    setOrderReviewMode,
    setOrderSubmitting,
    setLoadingDistributorItems,
    setActivePoProductField,
    orderSubmitLockRef,
    setOrderFormClientRequestId,
    createClientRequestId,
  ]);

  const createHistorySuggestionFromEntry = useCallback((historyEntry = null) => {
    if (!historyEntry?.item) return null;
    return {
      found: true,
      rate: historyEntry.item?.rate,
      unit_price: historyEntry.item?.unit_price,
      gst_rate: historyEntry.item?.gst_rate,
      uom: historyEntry.item?.uom,
      created_at: historyEntry.order?.created_at
        || historyEntry.order?.order_date
        || historyEntry.order?.expected_delivery
        || '',
      po_number: historyEntry.order?.po_number || '',
      distributor_name: historyEntry.order?.distributor_name || '',
    };
  }, []);

  const resolveSuggestedItemHistorySuggestion = useCallback((productId, distributorId = '') => {
    const selectedProductId = String(productId || '').trim();
    if (!selectedProductId) return null;

    const selectedDistributorId = String(distributorId || '').trim();
    const distributorHistoryEntry = selectedDistributorId && typeof getDistributorProductHistoryEntry === 'function'
      ? getDistributorProductHistoryEntry(selectedDistributorId, selectedProductId)
      : null;
    if (distributorHistoryEntry?.item) {
      return createHistorySuggestionFromEntry(distributorHistoryEntry);
    }

    const latestHistoryEntry = typeof getLatestProductHistoryEntry === 'function'
      ? getLatestProductHistoryEntry(selectedProductId)
      : null;
    return createHistorySuggestionFromEntry(latestHistoryEntry);
  }, [
    createHistorySuggestionFromEntry,
    getDistributorProductHistoryEntry,
    getLatestProductHistoryEntry,
  ]);

  const buildSuggestedOrderItems = useCallback((suggestedItems = [], distributorName = '', fallbackDate = '', distributorId = '') => (
    suggestedItems.length
      ? suggestedItems.map((item) => {
          const product = resolveSuggestedProduct(item);
          if (!product) return null;
          const nextItem = buildOrderDraftItem(product, {
            ...item,
            quantity: Math.max(1, toNumber(item.quantity || 1)),
            discount_type: 'percent',
            discount_value: 0,
            reference_rate: item.rate ?? item.unit_price ?? product?.price,
            reference_rate_source: 'recent supplier history',
            last_purchase_hint: 'Suggested from recent supplier history',
            last_purchase_rate: item.rate ?? item.unit_price ?? product?.price,
            last_purchase_distributor_name: distributorName,
            last_purchase_created_at: item.created_at || fallbackDate || '',
            last_purchase_po_number: item.po_number || '',
          });
          const historySuggestion = resolveSuggestedItemHistorySuggestion(item.product_id, distributorId);
          if (!historySuggestion) {
            const sourceFlags = getPurchaseDraftItemSourceFlags({ row_source: 'manual' });
            return {
              ...nextItem,
              row_source: sourceFlags.rowSource,
              po_item_source: sourceFlags.poItemSource,
              po_item_locked: sourceFlags.poItemLocked,
            };
          }
          const sourceFlags = getPurchaseDraftItemSourceFlags({ row_source: 'manual' });
          return {
            ...applyPurchaseDraftLastPurchaseSuggestion({
              item: nextItem,
              product,
              suggestion: historySuggestion,
              suggestedQuantity: item.quantity,
              preserveQuantity: true,
              preserveRate: item.rate != null || item.unit_price != null,
              preserveGst: item.gst_rate != null,
              preserveUom: Boolean(item.uom),
              resolvePurchaseUnitForProduct,
              normalizeGstRateOption,
              toNumber,
            }),
            row_source: sourceFlags.rowSource,
            po_item_source: sourceFlags.poItemSource,
            po_item_locked: sourceFlags.poItemLocked,
          };
        }).filter(Boolean)
      : [createEmptyOrderItem()]
  ), [
    buildOrderDraftItem,
    createEmptyOrderItem,
    normalizeGstRateOption,
    resolveSuggestedProduct,
    resolveSuggestedItemHistorySuggestion,
    resolvePurchaseUnitForProduct,
    toNumber,
  ]);

  const resolvePrimarySupplier = useCallback((distributorId) => {
    const normalizedId = String(distributorId || '').trim();
    if (!normalizedId) return null;
    const matches = (Array.isArray(suppliers) ? suppliers : [])
      .filter((entry) => String(entry?.distributor_id || '') === normalizedId);
    if (!matches.length) return null;
    return matches.find((entry) => entry?.is_primary) || matches[0] || null;
  }, [suppliers]);

  const hydrateSuggestedOrderItemsFromLastPurchase = useCallback((suggestedItems = [], distributorId = '') => {
    suggestedItems.forEach((item, index) => {
      const selectedProductId = String(item?.product_id || '').trim();
      if (!selectedProductId) return;
      if (resolveSuggestedItemHistorySuggestion(selectedProductId, distributorId)) return;

      Promise.resolve(loadLastPurchaseSuggestion(selectedProductId))
        .then((suggestion) => {
          if (!suggestion?.found) return;
          setOrderFormData((prev) => {
            const nextItems = Array.isArray(prev?.items) ? [...prev.items] : [];
            const current = nextItems[index];
            if (!current || String(current.product_id || '').trim() !== selectedProductId) return prev;
            const preserveFlags = getLastPurchaseSuggestionPreserveFlags({
              item: current,
              normalizeGstRateOption,
              toNumber,
            });
            const product = resolveSuggestedProduct(item)
              || findActivePurchaseProduct(products, selectedProductId)
              || null;
            nextItems[index] = applyPurchaseDraftLastPurchaseSuggestion({
              item: current,
              product,
              suggestion,
              suggestedQuantity: item.quantity,
              preserveQuantity: true,
              preserveRate: preserveFlags.preserveRate || item.rate != null || item.unit_price != null,
              preserveGst: preserveFlags.preserveGst || item.gst_rate != null,
              preserveUom: preserveFlags.preserveUom || Boolean(item.uom),
              resolvePurchaseUnitForProduct,
              normalizeGstRateOption,
              toNumber,
            });
            return { ...prev, items: nextItems };
          });
        })
        .catch(() => {
          // keep the seeded draft values when last-purchase lookup is unavailable
        });
    });
  }, [
    loadLastPurchaseSuggestion,
    normalizeGstRateOption,
    products,
    resolvePurchaseUnitForProduct,
    resolveSuggestedItemHistorySuggestion,
    resolveSuggestedProduct,
    setOrderFormData,
    toNumber,
  ]);

  const openCreateOrderForm = useCallback((options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const suggestedItems = Array.isArray(safeOptions.suggested_items) ? safeOptions.suggested_items : [];
    const baseOrderFormData = getDefaultOrderFormData();
    const plannedOrderDate = safeOptions.planned_order_date
      || safeOptions.plannedOrderDate
      || baseOrderFormData.planned_order_date;
    const expectedDelivery = safeOptions.expected_delivery
      || safeOptions.order_date
      || safeOptions.planned_order_date
      || safeOptions.plannedOrderDate
      || baseOrderFormData.expected_delivery;
    setError('');
    resetOrderForm();
    setEditingOrderId(null);
    setOrderFullMode(false);
    setOrderReviewMode(false);
    setOrderFormData({
      ...baseOrderFormData,
      distributor_id: '',
      distributor_name: '',
      supplier_id: '',
      supplier_name: '',
      planned_order_date: plannedOrderDate,
      expected_delivery: expectedDelivery,
      strict_due_date: safeOptions.strict_due_date || '',
      strict_due_note: safeOptions.strict_due_note || '',
      notes: safeOptions.notes || '',
      items: buildSuggestedOrderItems(
        suggestedItems,
        '',
        plannedOrderDate,
        ''
      ),
    });
    setShowOrderForm(true);
    hydrateSuggestedOrderItemsFromLastPurchase(suggestedItems, '');
  }, [
    buildSuggestedOrderItems,
    getDefaultOrderFormData,
    hydrateSuggestedOrderItemsFromLastPurchase,
    resetOrderForm,
    setEditingOrderId,
    setError,
    setOrderFormData,
    setOrderFullMode,
    setOrderReviewMode,
    setShowOrderForm,
  ]);

  const openCreateOrderFormForDistributor = useCallback((distributorId, options = {}) => {
    const safeOptions = options && typeof options === 'object' ? options : {};
    const distributor = distributors.find((entry) => String(entry.id) === String(distributorId));
    const resolvedDistributorId = distributor ? String(distributor.id) : String(distributorId || '');
    const requestedSupplierId = String(
      safeOptions.supplier_id ?? safeOptions.supplierId ?? ''
    ).trim();
    const supplierMatches = (Array.isArray(suppliers) ? suppliers : [])
      .filter((entry) => String(entry?.distributor_id || '') === resolvedDistributorId);
    const supplier = requestedSupplierId
      ? (
        supplierMatches.find((entry) => String(entry?.id || '') === requestedSupplierId && entry?.is_active !== false)
        || supplierMatches.find((entry) => String(entry?.id || '') === requestedSupplierId)
        || resolvePrimarySupplier(distributor?.id || distributorId)
      )
      : resolvePrimarySupplier(distributor?.id || distributorId);
    const suggestedItems = Array.isArray(safeOptions.suggested_items) ? safeOptions.suggested_items : [];
    const fallbackDistributorName = String(
      safeOptions.distributor_name || safeOptions.distributorName || ''
    ).trim();
    const fallbackSupplierName = String(
      safeOptions.supplier_name || safeOptions.supplierName || ''
    ).trim();
    const baseOrderFormData = getDefaultOrderFormData();
    const plannedOrderDate = safeOptions.planned_order_date
      || safeOptions.plannedOrderDate
      || baseOrderFormData.planned_order_date;
    const expectedDelivery = safeOptions.expected_delivery
      || safeOptions.order_date
      || safeOptions.planned_order_date
      || safeOptions.plannedOrderDate
      || baseOrderFormData.expected_delivery;
    setError('');
    resetOrderForm();
    setEditingOrderId(null);
    setOrderFullMode(false);
    setOrderReviewMode(false);
    setOrderFormData({
      ...baseOrderFormData,
      distributor_id: distributor ? String(distributor.id) : String(distributorId || ''),
      distributor_name: distributor?.name || fallbackDistributorName,
      supplier_id: supplier ? String(supplier.id) : '',
      supplier_name: supplier?.name || fallbackSupplierName,
      planned_order_date: plannedOrderDate,
      expected_delivery: expectedDelivery,
      strict_due_date: safeOptions.strict_due_date || '',
      strict_due_note: safeOptions.strict_due_note || '',
      notes: safeOptions.notes || '',
      items: buildSuggestedOrderItems(
        suggestedItems,
        distributor?.name || fallbackDistributorName,
        plannedOrderDate,
        distributor?.id || distributorId
      ),
    });
    setShowOrderForm(true);
    hydrateSuggestedOrderItemsFromLastPurchase(suggestedItems, distributor?.id || distributorId);
    }, [
      distributors,
      suppliers,
      resolvePrimarySupplier,
      buildSuggestedOrderItems,
      getDefaultOrderFormData,
      hydrateSuggestedOrderItemsFromLastPurchase,
    resetOrderForm,
    setError,
    setEditingOrderId,
    setOrderFullMode,
    setOrderReviewMode,
    setOrderFormData,
    setShowOrderForm,
  ]);

  const closeOrderForm = useCallback(() => {
    setShowOrderForm(false);
    setOrderReviewMode(false);
    resetOrderForm();
  }, [resetOrderForm, setOrderReviewMode, setShowOrderForm]);

  const handlePurchaseSectionChange = useCallback((sectionKey) => {
    setActiveSubTab(sectionKey);
  }, [setActiveSubTab]);

  const handleOpenOrderReview = useCallback(() => {
    setError('');
    const selectedSupplier = (Array.isArray(suppliers) ? suppliers : [])
      .find((s) => String(s.id) === String(orderFormData.supplier_id) && s.is_active !== false);
    const selectedDistributor = distributors.find((d) => String(d.id) === String(orderFormData.distributor_id) && d.status === 'active');
    if (!selectedSupplier || !selectedDistributor || String(selectedSupplier.distributor_id || '') !== String(selectedDistributor.id || '')) {
      setError('Please select a valid supplier');
      return false;
    }

    const submission = preparePurchaseOrderSubmission({
      items: orderFormData.items,
      products,
      findProductForItem,
      calculateOrderItem,
      calculateOrderTotals,
    });
    if (submission.error) {
      setError(submission.error);
      return false;
    }

    setOrderReviewMode(true);
    return true;
  }, [
    calculateOrderItem,
    calculateOrderTotals,
    distributors,
    suppliers,
    findProductForItem,
    orderFormData.distributor_id,
    orderFormData.items,
    orderFormData.supplier_id,
    products,
    setError,
    setOrderReviewMode,
  ]);

  const handleOrderSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (orderSubmitLockRef.current || orderSubmitting) return;
    orderSubmitLockRef.current = true;
    setError('');

    try {
      setOrderSubmitting(true);
      const selectedSupplier = (Array.isArray(suppliers) ? suppliers : [])
        .find((s) => String(s.id) === String(orderFormData.supplier_id) && s.is_active !== false);
      const selectedDistributor = distributors.find((d) => String(d.id) === String(orderFormData.distributor_id) && d.status === 'active');
      if (!selectedSupplier || !selectedDistributor || String(selectedSupplier.distributor_id || '') !== String(selectedDistributor.id || '')) {
        setError('Please select a valid supplier');
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

      const submission = preparePurchaseOrderSubmission({
        items: orderFormData.items,
        products,
        findProductForItem,
        calculateOrderItem,
        calculateOrderTotals,
      });
      if (submission.error) {
        setError(submission.error);
        setOrderSubmitting(false);
        orderSubmitLockRef.current = false;
        return;
      }

      const payload = buildPurchaseOrderSavePayload({
        distributorId: orderFormData.distributor_id,
        supplierId: orderFormData.supplier_id,
        plannedOrderDate: orderFormData.planned_order_date,
        expectedDelivery: orderFormData.expected_delivery,
        strictDueDate: orderFormData.strict_due_date || null,
        strictDueNote: orderFormData.strict_due_note || '',
        notes: orderFormData.notes,
        calculatedItems: submission.calculatedItems,
        totals: submission.totals,
        createdBy: user?.id,
        clientRequestId: editingOrderId ? undefined : orderFormClientRequestId,
      });

      const response = editingOrderId
        ? await purchaseOrdersApi.update(editingOrderId, payload)
        : await purchaseOrdersApi.create(payload);
      const savedOrderId = String(response?.id || editingOrderId || '').trim();
      const nextSupplierId = String(orderFormData?.supplier_id || '').trim();
      const [nextOrders] = await Promise.all([
        fetchOrders(),
        typeof fetchOperationsSummary === 'function' ? fetchOperationsSummary() : Promise.resolve(),
        typeof refreshSupplierRegisteredProducts === 'function' && nextSupplierId
          ? refreshSupplierRegisteredProducts(nextSupplierId)
          : Promise.resolve([]),
      ]);
      await invalidateDomain(DOMAINS.PurchaseOrders, { sourceId: 'purchase-orders' });
      const savedOrder = nextOrders.find((order) => String(order?.id || '') === savedOrderId) || null;
      const savedPoNumber = String(
        response?.po_number
        || savedOrder?.po_number
        || ''
      ).trim();
      const successMessage = editingOrderId
        ? `Purchase order${savedPoNumber ? ` ${savedPoNumber}` : ''} updated.`
        : `Purchase order${savedPoNumber ? ` ${savedPoNumber}` : ''} created.`;

      setSuccess(successMessage);
      setLastSavedOrderSummary({
        id: savedOrder?.id ?? response?.id ?? editingOrderId ?? null,
        poNumber: savedPoNumber,
        distributorName: String(
          savedOrder?.supplier_name
          || orderFormData?.supplier_name
          || savedOrder?.distributor_name
          || orderFormData?.distributor_name
          || ''
        ).trim(),
        totalAmount: Number(savedOrder?.total_amount ?? savedOrder?.total ?? submission.totals?.totalAmount ?? 0) || 0,
        mode: editingOrderId ? 'updated' : 'created',
      });
      if (typeof onOrderSaved === 'function') {
        onOrderSaved({
          id: savedOrder?.id ?? response?.id ?? editingOrderId ?? null,
          poNumber: savedPoNumber,
        });
      }
      closeOrderForm();
    } catch (err) {
      setError(
        getPurchaseRequestErrorMessage(
          err,
          editingOrderId ? 'Failed to update purchase order' : 'Failed to create purchase order'
        )
      );
      setOrderSubmitting(false);
      orderSubmitLockRef.current = false;
    }
  }, [
    orderSubmitLockRef,
    orderSubmitting,
    setError,
    setOrderSubmitting,
    distributors,
    suppliers,
    orderFormData,
    products,
    findProductForItem,
    calculateOrderItem,
    calculateOrderTotals,
    user,
    editingOrderId,
    orderFormClientRequestId,
    purchaseOrdersApi,
    setSuccess,
    setLastSavedOrderSummary,
    onOrderSaved,
    closeOrderForm,
    fetchOrders,
    fetchOperationsSummary,
    getPurchaseRequestErrorMessage,
    refreshSupplierRegisteredProducts,
  ]);

  const handleEditOrder = useCallback(async (orderId) => {
    try {
      setError('');
      const order = await purchaseOrdersApi.getById(orderId);
      if (!order || !isPoEditable(order)) {
        setError('Only prepared, sent, or revised orders can be edited');
        return;
      }

      const mappedItems = (order.items || []).map((item) => {
        const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
        const sourceFlags = getPurchaseDraftItemSourceFlags(item);
        return buildOrderDraftItem(product, {
          ...item,
          product_query: item.product_name || '',
          quantity: toNumber(item.quantity),
          rate_warning_acknowledged: true,
          last_purchase_hint: '',
          discount_warning_acknowledged: true,
          row_source: sourceFlags.rowSource,
          po_item_source: sourceFlags.poItemSource,
          po_item_locked: sourceFlags.poItemLocked,
        });
      });

      setOrderFormData({
        distributor_id: order.distributor_id ? String(order.distributor_id) : '',
        distributor_name: order.distributor_name || distributors.find((d) => String(d.id) === String(order.distributor_id))?.name || '',
        supplier_id: order.supplier_id ? String(order.supplier_id) : '',
        supplier_name: order.supplier_name || '',
        planned_order_date: toDateInputValue(order.planned_order_date || order.expected_delivery),
        expected_delivery: toDateInputValue(order.expected_delivery),
        strict_due_date: toDateInputValue(order.strict_due_date),
        strict_due_note: order.strict_due_note || '',
        notes: order.notes || '',
        items: mappedItems.length ? mappedItems : [createEmptyOrderItem()],
      });
      setOrderFullMode(true);
      setOrderReviewMode(false);
      setEditingOrderId(order.id);
      setShowOrderForm(true);
    } catch (err) {
      setError(err.message || 'Failed to load order for edit');
    }
  }, [
    setError,
    purchaseOrdersApi,
    isPoEditable,
    products,
    buildOrderDraftItem,
    toNumber,
    setOrderFormData,
    distributors,
    toDateInputValue,
    createEmptyOrderItem,
    setOrderFullMode,
    setOrderReviewMode,
    setEditingOrderId,
    setShowOrderForm,
  ]);

  return {
    handleFilterChange,
    openCreateOrderForm,
    openCreateOrderFormForDistributor,
    closeOrderForm,
    handlePurchaseSectionChange,
    handleOpenOrderReview,
    handleOrderSubmit,
    handleEditOrder,
    resetOrderForm,
  };
};

export default usePurchaseOrderFormHandlers;
