import { useCallback } from 'react';

const normalizeSearchValue = (value) => String(value || '').trim().toLowerCase();

const usePurchaseLookups = ({
  distributors,
  products,
  purchaseOrders,
  buildOrderDraftItem,
  setOrderFormData,
  resolveProductByInputHelper,
  getDistributorProductOptionsHelper,
  getDistributorHistoryProductsHelper,
}) => {
  const resolveDistributorByInput = useCallback((value) => {
    const query = normalizeSearchValue(value);
    if (!query) return null;
    return distributors.find((entry) =>
      entry.status === 'active' && (
        String(entry.id) === query
        || String(entry.name || '').trim().toLowerCase() === query
      )
    ) || null;
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
    setOrderFormData((prev) => ({
      ...prev,
      distributor_name: value,
      distributor_id: match ? String(match.id) : '',
    }));
  }, [resolveDistributorByInput, setOrderFormData]);

  return {
    resolveDistributorByInput,
    resolveProductByInput,
    getDistributorProductOptions,
    getDistributorHistoryProducts,
    handleDistributorInputChange,
  };
};

export default usePurchaseLookups;
