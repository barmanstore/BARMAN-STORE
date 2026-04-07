import { useCallback, useEffect } from 'react';
import createDefaultOperationsSummary from '../utils/operationsSummary';
import { getLocalLedgerEntries } from '../utils/localLedgerStorage';
import { getDerivedLedgerFromOrders, mergeLedgerRecords } from '../utils/ledgerHelpers';
import { safeSessionStorageGet, safeSessionStorageSet } from '../../../../shared/utils/storage';

const PURCHASE_LOOKUP_CACHE_KEY = 'purchase_lookup_cache_v1';
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

const buildOperationsSummaryParams = ({ filters, rollupParams }) => {
  const params = {};
  if (filters?.distributor_id) params.distributor_id = filters.distributor_id;
  if (rollupParams?.mode === 'custom') {
    if (rollupParams.start_date) params.rollup_start_date = rollupParams.start_date;
    if (rollupParams.end_date) params.rollup_end_date = rollupParams.end_date;
  } else if (rollupParams?.days) {
    params.rollup_days = rollupParams.days;
  }
  return params;
};

const readCachedPurchaseLookups = () => {
  try {
    const raw = safeSessionStorageGet(PURCHASE_LOOKUP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const updatedAt = Number(parsed?.updatedAt || 0);
    if (!updatedAt || (Date.now() - updatedAt) > LOOKUP_CACHE_TTL_MS) {
      return null;
    }
    const distributors = Array.isArray(parsed?.distributors) ? parsed.distributors : null;
    const suppliers = Array.isArray(parsed?.suppliers) ? parsed.suppliers : null;
    const products = Array.isArray(parsed?.products) ? parsed.products : null;
    if (!distributors || !products || !suppliers) return null;
    return { distributors, suppliers, products };
  } catch (_) {
    return null;
  }
};

const writeCachedPurchaseLookups = ({ distributors, suppliers, products }) => {
  safeSessionStorageSet(PURCHASE_LOOKUP_CACHE_KEY, JSON.stringify({
    updatedAt: Date.now(),
    distributors: Array.isArray(distributors) ? distributors : [],
    suppliers: Array.isArray(suppliers) ? suppliers : [],
    products: Array.isArray(products) ? products : [],
  }));
};

const usePurchaseDataFetch = ({
  distributorsApi,
  suppliersApi,
  productsApi,
  purchaseOrdersApi,
  purchaseReturnsApi,
  distributorLedgerApi,
  filters,
  rollupParams,
  activeSubTab,
  purchaseOrders,
  localLedgerKey,
  setLoading,
  setError,
  setDistributors,
  setProducts,
  setSuppliers,
  setPurchaseOrders,
  setOperationsLoading,
  setOperationsSummary,
  setPurchaseReturns,
  setLedgerLoading,
  setLedgerRecords,
}) => {
  const fetchData = useCallback(async () => {
    const cachedLookups = readCachedPurchaseLookups();
    if (cachedLookups) {
      setDistributors(cachedLookups.distributors);
      setSuppliers(cachedLookups.suppliers);
      setProducts(cachedLookups.products);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const [distributorsData, suppliersData, productsData] = await Promise.all([
        distributorsApi.getAll(),
        suppliersApi.getAll(),
        productsApi.getAll(),
      ]);
      const nextDistributors = Array.isArray(distributorsData) ? distributorsData : [];
      const nextSuppliers = Array.isArray(suppliersData) ? suppliersData : [];
      const nextProducts = Array.isArray(productsData) ? productsData : [];
      setDistributors(nextDistributors);
      setSuppliers(nextSuppliers);
      setProducts(nextProducts);
      writeCachedPurchaseLookups({
        distributors: nextDistributors,
        suppliers: nextSuppliers,
        products: nextProducts,
      });
    } catch (err) {
      if (!cachedLookups) {
        setError('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, [distributorsApi, suppliersApi, productsApi, setLoading, setDistributors, setSuppliers, setProducts, setError]);

  const fetchOrders = useCallback(async () => {
    try {
      const orders = await purchaseOrdersApi.getAll(filters);
      const nextOrders = Array.isArray(orders) ? orders : [];
      setPurchaseOrders(nextOrders);
      return nextOrders;
    } catch (err) {
      setError('Failed to load purchase orders');
      return [];
    }
  }, [purchaseOrdersApi, filters, setPurchaseOrders, setError]);

  const fetchOperationsSummary = useCallback(async () => {
    try {
      setOperationsLoading(true);
      const params = buildOperationsSummaryParams({ filters, rollupParams });
      const summary = await purchaseOrdersApi.getOperationsSummary(params);
      setOperationsSummary(summary || createDefaultOperationsSummary());
    } catch (err) {
      setOperationsSummary(createDefaultOperationsSummary());
    } finally {
      setOperationsLoading(false);
    }
  }, [purchaseOrdersApi, filters, rollupParams, setOperationsLoading, setOperationsSummary]);

  const fetchReturns = useCallback(async () => {
    try {
      const returns = await purchaseReturnsApi.getAll(filters);
      setPurchaseReturns(returns || []);
    } catch (err) {
      setError('Failed to load purchase returns');
    }
  }, [purchaseReturnsApi, filters, setPurchaseReturns, setError]);

  const fetchDistributorLedger = useCallback(async () => {
    try {
      setLedgerLoading(true);
      const localEntries = getLocalLedgerEntries(localLedgerKey)
        .filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      const response = filters.distributor_id
        ? await distributorLedgerApi.getByDistributor(filters.distributor_id, { limit: 100 })
        : await distributorLedgerApi.getAll({ limit: 100 });
      const apiRecords = Array.isArray(response)
        ? response
        : (response?.rows || response?.data || response?.transactions || []);
      setLedgerRecords(mergeLedgerRecords(apiRecords, localEntries, derivedEntries));
    } catch (err) {
      const localEntries = getLocalLedgerEntries(localLedgerKey)
        .filter(entry => !filters.distributor_id || String(entry.distributor_id) === String(filters.distributor_id));
      const derivedEntries = getDerivedLedgerFromOrders(purchaseOrders, filters.distributor_id);
      setLedgerRecords(mergeLedgerRecords([], localEntries, derivedEntries));
    } finally {
      setLedgerLoading(false);
    }
  }, [
    distributorLedgerApi,
    filters,
    purchaseOrders,
    localLedgerKey,
    setLedgerLoading,
    setLedgerRecords,
  ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (activeSubTab === 'dashboard' || activeSubTab === 'payments' || activeSubTab === 'reminders') {
      fetchOperationsSummary();
    }
    if (activeSubTab === 'payments') {
      fetchDistributorLedger();
    }
    if (activeSubTab === 'returns') {
      fetchReturns();
    }
  }, [
    activeSubTab,
    filters.distributor_id,
    purchaseOrders,
    rollupParams.mode,
    rollupParams.days,
    rollupParams.start_date,
    rollupParams.end_date,
    fetchOperationsSummary,
    fetchDistributorLedger,
    fetchReturns,
  ]);

  return {
    fetchData,
    fetchOrders,
    fetchOperationsSummary,
    fetchReturns,
    fetchDistributorLedger,
  };
};

export default usePurchaseDataFetch;
