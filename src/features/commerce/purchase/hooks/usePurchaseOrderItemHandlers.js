import { useCallback, useEffect, useRef } from 'react';
import {
  applyPurchaseDraftFieldChange,
  applyPurchaseDraftLastPurchaseSuggestion,
  applyPurchaseDraftProductSelection,
  clearPurchaseDraftProductSelection,
  getLastPurchaseSuggestionPreserveFlags,
} from '../utils/orderDrafts';

const usePurchaseOrderItemHandlers = ({
  setOrderFormData,
  products,
  loadLastPurchaseSuggestion,
  distributorId,
  getDistributorProductHistoryEntry,
  resolveProductByInput,
  getProductSearchLabel,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  toNumber,
  findProductForItem,
  activePoProductField,
}) => {
  const activePoProductFieldRef = useRef(activePoProductField);

  useEffect(() => {
    activePoProductFieldRef.current = activePoProductField;
  }, [activePoProductField]);

  const handleOrderItemChange = useCallback(async (index, field, value) => {
    if (field === 'product_id') {
      const selectedProductId = String(value || '');
      const product = products.find((p) => String(p.id) === selectedProductId);
      setOrderFormData((prev) => {
        const items = [...prev.items];
        const current = items[index];
        if (!current) return prev;
        items[index] = product
          ? applyPurchaseDraftProductSelection({
              item: current,
              product,
              getProductSearchLabel,
              resolvePurchaseUnitForProduct,
              toNumber,
            })
          : clearPurchaseDraftProductSelection({ item: current, query: '' });
        return { ...prev, items };
      });

      if (!selectedProductId) return;

      const selectedDistributorId = String(distributorId || '').trim();
      const distributorHistoryEntry = selectedDistributorId && typeof getDistributorProductHistoryEntry === 'function'
        ? getDistributorProductHistoryEntry(selectedDistributorId, selectedProductId)
        : null;

      if (distributorHistoryEntry?.item) {
        setOrderFormData((prev) => {
          const nextItems = [...prev.items];
          const current = nextItems[index];
          if (!current || String(current.product_id) !== selectedProductId) return prev;
          const selectedProduct = products.find((p) => String(p.id) === selectedProductId) || distributorHistoryEntry.product || null;
          const preserveFlags = getLastPurchaseSuggestionPreserveFlags({
            item: current,
            normalizeGstRateOption,
            toNumber,
          });
          nextItems[index] = applyPurchaseDraftLastPurchaseSuggestion({
            item: current,
            product: selectedProduct,
            suggestion: {
              found: true,
              rate: distributorHistoryEntry.item?.rate,
              unit_price: distributorHistoryEntry.item?.unit_price,
              gst_rate: distributorHistoryEntry.item?.gst_rate,
              uom: distributorHistoryEntry.item?.uom,
              created_at: distributorHistoryEntry.order?.created_at
                || distributorHistoryEntry.order?.order_date
                || distributorHistoryEntry.order?.expected_delivery
                || '',
              po_number: distributorHistoryEntry.order?.po_number || '',
              distributor_name: distributorHistoryEntry.order?.distributor_name || '',
            },
            suggestedQuantity: distributorHistoryEntry.item?.quantity,
            preserveQuantity: Number(current?.quantity ?? 1) > 1,
            resolvePurchaseUnitForProduct,
            normalizeGstRateOption,
            toNumber,
            ...preserveFlags,
          });
          return { ...prev, items: nextItems };
        });
        return;
      }

      try {
        const suggestion = await loadLastPurchaseSuggestion(selectedProductId);
        if (!suggestion) return;

        setOrderFormData((prev) => {
          const nextItems = [...prev.items];
          const current = nextItems[index];
          if (!current || String(current.product_id) !== selectedProductId) return prev;
          const selectedProduct = products.find((p) => String(p.id) === selectedProductId) || null;
          const preserveFlags = getLastPurchaseSuggestionPreserveFlags({
            item: current,
            normalizeGstRateOption,
            toNumber,
          });
          const activeField = activePoProductFieldRef.current;
          const isStillActiveRow = Boolean(
            activeField?.mode === 'entry'
            && Number(activeField?.index) === index
          );
          if (!isStillActiveRow) {
            preserveFlags.preserveRate = true;
            preserveFlags.preserveGst = true;
            preserveFlags.preserveUom = true;
          }
          nextItems[index] = applyPurchaseDraftLastPurchaseSuggestion({
            item: current,
            product: selectedProduct,
            suggestion,
            resolvePurchaseUnitForProduct,
            normalizeGstRateOption,
            toNumber,
            ...preserveFlags,
          });
          return { ...prev, items: nextItems };
        });
      } catch (_) {
        // keep product defaults when suggestion API is unavailable
      }
      return;
    }

    setOrderFormData((prev) => {
      const items = [...prev.items];
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
    normalizeGstRateOption,
    toNumber,
    distributorId,
    getDistributorProductHistoryEntry,
    products,
    resolvePurchaseUnitForProduct,
    getProductSearchLabel,
    setOrderFormData,
    loadLastPurchaseSuggestion,
    findProductForItem,
    activePoProductField,
  ]);

  const handleOrderProductInputChange = useCallback((index, value) => {
    const match = resolveProductByInput(value);
    setOrderFormData((prev) => {
      const items = [...prev.items];
      const current = items[index];
      if (!current) return prev;
      const currentProductId = String(current?.product_id || '').trim();
      const shouldKeepSelection = Boolean(
        match
        && currentProductId
        && String(match.id) === currentProductId
      );
      items[index] = shouldKeepSelection
        ? {
            ...current,
            product_query: value,
          }
        : clearPurchaseDraftProductSelection({
            item: current,
            query: value,
          });
      return { ...prev, items };
    });
  }, [resolveProductByInput, setOrderFormData]);

  return {
    handleOrderItemChange,
    handleOrderProductInputChange,
  };
};

export default usePurchaseOrderItemHandlers;
