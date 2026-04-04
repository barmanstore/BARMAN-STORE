import { useCallback } from 'react';

const normalizeSearchValue = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const usePurchaseLookups = ({
  distributors,
  products,
  purchaseOrders,
  buildOrderDraftItem,
  createEmptyOrderItem,
  setOrderFormData,
  resolveProductByInputHelper,
  getDistributorProductOptionsHelper,
  getDistributorProductHistoryEntryHelper,
  getLatestProductHistoryEntryHelper,
  getDistributorHistoryProductsHelper,
}) => {
  const resolveDistributorByInput = useCallback((value) => {
    const query = normalizeSearchValue(value);
    if (!query) return null;
    return distributors.find((entry) => {
      const status = String(entry?.status || '').trim().toLowerCase();
      const isActive = !status || status === 'active';
      if (!isActive) return false;
      return (
        String(entry.id) === query
        || String(entry.name || '').trim().toLowerCase() === query
      );
    }) || null;
  }, [distributors]);

  const resolveProductByInput = useCallback((value) => (
    resolveProductByInputHelper(value, products)
  ), [resolveProductByInputHelper, products]);

  const getDistributorProductOptions = useCallback((distributorId) => (
    getDistributorProductOptionsHelper({
      distributorId,
      products,
      purchaseOrders,
    })
  ), [getDistributorProductOptionsHelper, products, purchaseOrders]);

  const getDistributorProductHistoryEntry = useCallback((distributorId, productId) => (
    getDistributorProductHistoryEntryHelper({
      distributorId,
      productId,
      products,
      purchaseOrders,
    })
  ), [getDistributorProductHistoryEntryHelper, products, purchaseOrders]);

  const getLatestProductHistoryEntry = useCallback((productId) => (
    getLatestProductHistoryEntryHelper({
      productId,
      products,
      purchaseOrders,
    })
  ), [getLatestProductHistoryEntryHelper, products, purchaseOrders]);

  const getDistributorHistoryProducts = useCallback((distributorId) => (
    getDistributorHistoryProductsHelper({
      distributorId,
      products,
      purchaseOrders,
      buildOrderDraftItem,
    })
  ), [getDistributorHistoryProductsHelper, products, purchaseOrders, buildOrderDraftItem]);

  const handleDistributorInputChange = useCallback((value) => {
    const match = resolveDistributorByInput(value);
    setOrderFormData((prev) => {
      const nextDistributorId = match ? String(match.id) : '';
      const previousDistributorId = String(prev?.distributor_id || '').trim();
      const distributorChanged = previousDistributorId !== nextDistributorId;
      return {
        ...prev,
        distributor_name: value,
        distributor_id: nextDistributorId,
        items: distributorChanged
          ? [createEmptyOrderItem()]
          : prev.items,
      };
    });
  }, [createEmptyOrderItem, resolveDistributorByInput, setOrderFormData]);

  return {
    resolveDistributorByInput,
    resolveProductByInput,
    getDistributorProductOptions,
    getDistributorProductHistoryEntry,
    getLatestProductHistoryEntry,
    getDistributorHistoryProducts,
    handleDistributorInputChange,
  };
};

export default usePurchaseLookups;
