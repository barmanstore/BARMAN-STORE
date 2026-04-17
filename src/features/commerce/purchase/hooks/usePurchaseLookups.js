import { useCallback, useMemo } from 'react';

const normalizeSearchValue = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const usePurchaseLookups = ({
  distributors,
  suppliers,
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
  const distributorById = useMemo(
    () => new Map(
      (Array.isArray(distributors) ? distributors : []).map((entry) => [String(entry?.id || ''), entry])
    ),
    [distributors]
  );

  const resolveSupplierByInput = useCallback((value) => {
    const query = normalizeSearchValue(value);
    if (!query) return null;

    const supplierMatches = (Array.isArray(suppliers) ? suppliers : []).find((entry) => {
      const isActive = entry?.is_active !== false;
      if (!isActive) return false;
      const supplierName = normalizeSearchValue(entry?.name || '');
      const distributorName = normalizeSearchValue(
        distributorById.get(String(entry?.distributor_id || ''))?.name || ''
      );
      return (
        String(entry.id) === query
        || supplierName === query
        || `${supplierName} ${distributorName}`.trim() === query
        || `${supplierName} - ${distributorName}`.trim() === query
        || `${distributorName} ${supplierName}`.trim() === query
        || `${distributorName} - ${supplierName}`.trim() === query
      );
    });
    if (supplierMatches) return supplierMatches || null;

    const distributorMatch = Array.from(distributorById.values()).find(
      (entry) => normalizeSearchValue(entry?.name || '') === query
    );
    if (!distributorMatch) return null;

    const distributorSuppliers = (Array.isArray(suppliers) ? suppliers : []).filter((entry) => {
      const isActive = entry?.is_active !== false;
      return isActive && String(entry?.distributor_id || '') === String(distributorMatch.id || '');
    });
    if (distributorSuppliers.length === 1) return distributorSuppliers[0];
    return distributorSuppliers.find((entry) => entry?.is_primary) || null;
  }, [distributorById, suppliers]);

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
    const match = resolveSupplierByInput(value);
    setOrderFormData((prev) => {
      const nextSupplierId = match ? String(match.id) : '';
      const nextDistributorId = match ? String(match.distributor_id || '') : '';
      const distributorName = match
        ? (distributorById.get(String(match.distributor_id || ''))?.name || '')
        : '';
      const previousSupplierId = String(prev?.supplier_id || '').trim();
      const distributorChanged = previousSupplierId !== nextSupplierId;
      return {
        ...prev,
        supplier_id: nextSupplierId,
        supplier_name: value,
        distributor_id: nextDistributorId,
        distributor_name: distributorName,
        items: distributorChanged
          ? [createEmptyOrderItem()]
          : prev.items,
      };
    });
  }, [createEmptyOrderItem, distributorById, resolveSupplierByInput, setOrderFormData]);

  return {
    resolveSupplierByInput,
    resolveProductByInput,
    getDistributorProductOptions,
    getDistributorProductHistoryEntry,
    getLatestProductHistoryEntry,
    getDistributorHistoryProducts,
    handleDistributorInputChange,
  };
};

export default usePurchaseLookups;
