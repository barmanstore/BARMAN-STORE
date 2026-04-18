import { useCallback } from 'react';
import {
  applyPurchaseDraftFieldChange,
  applyPurchaseDraftLastPurchaseSuggestion,
  applyPurchaseDraftProductSelection,
  clearPurchaseDraftProductSelection,
  getLastPurchaseSuggestionPreserveFlags,
} from '../utils/orderDrafts';
import { findActivePurchaseProduct } from '../utils/productSearch';

const usePurchaseOrderItemHandlers = ({
  setOrderFormData,
  products,
  createEmptyOrderItem,
  loadLastPurchaseSuggestion,
  distributorId,
  getDistributorProductHistoryEntry,
  getLatestProductHistoryEntry,
  resolveProductByInput,
  getProductSearchLabel,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  toNumber,
  findProductForItem,
}) => {
  const handleOrderItemChange = useCallback(
    async (index, field, value) => {
      if (field === 'product_id') {
        const selectedProductId = String(value || '');
        const product = findActivePurchaseProduct(products, selectedProductId);
        setOrderFormData((prev) => {
          const items = [...prev.items];
          const current = items[index];
          if (!current) return prev;
          items[index] = product
            ? {
                ...applyPurchaseDraftProductSelection({
                  item: current,
                  product,
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
                  query: '',
                }),
                row_source: 'manual',
                po_item_source: 'manual_added',
                po_item_locked: false,
              };
          return { ...prev, items };
        });

        if (!selectedProductId) return;

        const selectedDistributorId = String(distributorId || '').trim();
        const distributorHistoryEntry =
          selectedDistributorId && typeof getDistributorProductHistoryEntry === 'function'
            ? getDistributorProductHistoryEntry(selectedDistributorId, selectedProductId)
            : null;
        const latestHistoryEntry = distributorHistoryEntry?.item
          ? distributorHistoryEntry
          : typeof getLatestProductHistoryEntry === 'function'
            ? getLatestProductHistoryEntry(selectedProductId)
            : null;

        if (latestHistoryEntry?.item) {
          setOrderFormData((prev) => {
            const nextItems = [...prev.items];
            const current = nextItems[index];
            if (!current || String(current.product_id) !== selectedProductId) return prev;
            const selectedProduct =
              findActivePurchaseProduct(products, selectedProductId) ||
              latestHistoryEntry.product ||
              null;
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
                rate: latestHistoryEntry.item?.rate,
                unit_price: latestHistoryEntry.item?.unit_price,
                gst_rate: latestHistoryEntry.item?.gst_rate,
                uom: latestHistoryEntry.item?.uom,
                created_at:
                  latestHistoryEntry.order?.created_at ||
                  latestHistoryEntry.order?.order_date ||
                  latestHistoryEntry.order?.expected_delivery ||
                  '',
                po_number: latestHistoryEntry.order?.po_number || '',
                distributor_name: latestHistoryEntry.order?.distributor_name || '',
              },
              suggestedQuantity: latestHistoryEntry.item?.quantity,
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
            const selectedProduct = findActivePurchaseProduct(products, selectedProductId) || null;
            const preserveFlags = getLastPurchaseSuggestionPreserveFlags({
              item: current,
              normalizeGstRateOption,
              toNumber,
            });
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
    },
    [
      normalizeGstRateOption,
      toNumber,
      distributorId,
      getDistributorProductHistoryEntry,
      getLatestProductHistoryEntry,
      products,
      resolvePurchaseUnitForProduct,
      getProductSearchLabel,
      setOrderFormData,
      loadLastPurchaseSuggestion,
      findProductForItem,
    ]
  );

  const handleOrderProductInputChange = useCallback(
    (index, value) => {
      const match = resolveProductByInput(value);
      setOrderFormData((prev) => {
        const items = [...prev.items];
        const current = items[index];
        if (!current) return prev;
        const currentProductId = String(current?.product_id || '').trim();
        const shouldKeepSelection = Boolean(
          match && currentProductId && String(match.id) === currentProductId
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
    },
    [resolveProductByInput, setOrderFormData]
  );

  const handleApplyCatalogProducts = useCallback(
    async (selectedProducts = []) => {
      const normalizedProducts = (Array.isArray(selectedProducts) ? selectedProducts : [])
        .map((product) => {
          const selectedProductId = String(product?.id || '').trim();
          if (!selectedProductId) return null;
          return findActivePurchaseProduct(products, selectedProductId) || null;
        })
        .filter(Boolean);
      if (!normalizedProducts.length) return;

      const distributorKey = String(distributorId || '').trim();
      const pendingRemoteSuggestions = [];

      setOrderFormData((prev) => {
        const items = Array.isArray(prev?.items) ? [...prev.items] : [];
        const hasVisibleDraftRows = items.some(
          (item) =>
            String(item?.product_id || '').trim() || String(item?.product_query || '').trim()
        );
        const existingProductIds = new Set(
          items.map((item) => String(item?.product_id || '').trim()).filter(Boolean)
        );

        normalizedProducts.forEach((product) => {
          const selectedProductId = String(product?.id || '').trim();
          if (!selectedProductId || existingProductIds.has(selectedProductId)) return;

          const draftItem = applyPurchaseDraftProductSelection({
            item: createEmptyOrderItem(),
            product,
            getProductSearchLabel,
            resolvePurchaseUnitForProduct,
            toNumber,
          });

          const distributorHistoryEntry =
            distributorKey && typeof getDistributorProductHistoryEntry === 'function'
              ? getDistributorProductHistoryEntry(distributorKey, selectedProductId)
              : null;
          const latestHistoryEntry = distributorHistoryEntry?.item
            ? distributorHistoryEntry
            : typeof getLatestProductHistoryEntry === 'function'
              ? getLatestProductHistoryEntry(selectedProductId)
              : null;

          const nextItem = latestHistoryEntry?.item
            ? applyPurchaseDraftLastPurchaseSuggestion({
                item: draftItem,
                product,
                suggestion: {
                  found: true,
                  rate: latestHistoryEntry.item?.rate,
                  unit_price: latestHistoryEntry.item?.unit_price,
                  gst_rate: latestHistoryEntry.item?.gst_rate,
                  uom: latestHistoryEntry.item?.uom,
                  created_at:
                    latestHistoryEntry.order?.created_at ||
                    latestHistoryEntry.order?.order_date ||
                    latestHistoryEntry.order?.expected_delivery ||
                    '',
                  po_number: latestHistoryEntry.order?.po_number || '',
                  distributor_name: latestHistoryEntry.order?.distributor_name || '',
                },
                suggestedQuantity: latestHistoryEntry.item?.quantity,
                preserveQuantity: false,
                resolvePurchaseUnitForProduct,
                normalizeGstRateOption,
                toNumber,
              })
            : draftItem;
          const preparedItem = {
            ...nextItem,
            quantity: 0,
            row_source: 'manual',
            po_item_source: 'manual_added',
            po_item_locked: false,
          };

          if (!latestHistoryEntry?.item) {
            pendingRemoteSuggestions.push({ productId: selectedProductId, product });
          }

          const emptyIndex = items.findIndex(
            (item) =>
              !String(item?.product_id || '').trim() && !String(item?.product_query || '').trim()
          );
          if (!hasVisibleDraftRows && emptyIndex >= 0) {
            items[emptyIndex] = preparedItem;
          } else {
            items.push(preparedItem);
          }
          existingProductIds.add(selectedProductId);
        });

        return { ...prev, items: items.length ? items : [createEmptyOrderItem()] };
      });

      await Promise.all(
        pendingRemoteSuggestions.map(async ({ productId, product }) => {
          try {
            const suggestion = await loadLastPurchaseSuggestion(productId);
            if (!suggestion?.found) return;
            setOrderFormData((prev) => {
              const items = Array.isArray(prev?.items) ? [...prev.items] : [];
              const targetIndex = items.findIndex(
                (item) => String(item?.product_id || '').trim() === productId
              );
              if (targetIndex < 0) return prev;
              const currentItem = items[targetIndex];
              const preserveFlags = getLastPurchaseSuggestionPreserveFlags({
                item: currentItem,
                normalizeGstRateOption,
                toNumber,
              });
              items[targetIndex] = applyPurchaseDraftLastPurchaseSuggestion({
                item: currentItem,
                product,
                suggestion,
                resolvePurchaseUnitForProduct,
                normalizeGstRateOption,
                toNumber,
                ...preserveFlags,
              });
              return { ...prev, items };
            });
          } catch (_) {
            // keep default product values when remote suggestion lookup is unavailable
          }
        })
      );
    },
    [
      createEmptyOrderItem,
      distributorId,
      getDistributorProductHistoryEntry,
      getLatestProductHistoryEntry,
      getProductSearchLabel,
      loadLastPurchaseSuggestion,
      normalizeGstRateOption,
      products,
      resolvePurchaseUnitForProduct,
      setOrderFormData,
      toNumber,
    ]
  );

  return {
    handleOrderItemChange,
    handleOrderProductInputChange,
    handleApplyCatalogProducts,
  };
};

export default usePurchaseOrderItemHandlers;
