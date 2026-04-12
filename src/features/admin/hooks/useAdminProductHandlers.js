import { useCallback, useEffect, useRef, useState } from 'react';

const BULK_JOB_FINAL_STATES = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

const normalizeBulkJobRecord = (value) => {
  if (!value || typeof value !== 'object') return null;
  const job = value.job && typeof value.job === 'object' ? value.job : value;
  if (!job || typeof job !== 'object') return null;
  return {
    ...job,
    id: Number(job.id || 0),
    total: Number(job.total || 0),
    processed: Number(job.processed || 0),
    succeeded: Number(job.succeeded || 0),
    failed: Number(job.failed || 0),
    skipped: Number(job.skipped || 0),
    conflicts: Number(job.conflicts || 0),
  };
};

const useAdminProductHandlers = ({
  productsApi,
  statsApi,
  setStats,
  showNotification,
  setEditingProduct,
  setShowProductForm,
  setProductFormMode,
  setProductEditLoadingId,
  editingProduct,
  loadProductsPage,
  productsPage,
  productTableSearch,
  productTableCategoryFilter,
  productTableStatusFilter,
  productTableLowStockOnly,
  productTableSortField,
  productTableSortDir,
}) => {
  const [bulkJob, setBulkJob] = useState(null);
  const bulkJobPollTimerRef = useRef(null);
  const bulkJobPollRunRef = useRef(0);

  const refreshProductsPage = useCallback(async () => {
    if (typeof loadProductsPage !== 'function') return;
    await loadProductsPage({
      page: productsPage,
      query: productTableSearch,
      category: productTableCategoryFilter,
      status: productTableStatusFilter,
      lowStockOnly: productTableLowStockOnly,
      sortField: productTableSortField,
      sortDir: productTableSortDir,
    });
  }, [
    loadProductsPage,
    productsPage,
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
  ]);

  const clearBulkJobPolling = useCallback(() => {
    if (bulkJobPollTimerRef.current) {
      clearTimeout(bulkJobPollTimerRef.current);
      bulkJobPollTimerRef.current = null;
    }
  }, []);

  const refreshProductsPageAndStats = useCallback(async () => {
    try {
      await refreshProductsPage();
      const statsData = await statsApi.orders();
      setStats(statsData);
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  }, [refreshProductsPage, setStats, statsApi]);

  const refreshProductsAfterBulkJob = useCallback(async () => {
    const refreshResult = await refreshProductsPageAndStats();
    if (!refreshResult.success) {
      return refreshResult;
    }
    return refreshResult;
  }, [refreshProductsPageAndStats]);

  const notifyBulkJobCompletion = useCallback((job) => {
    const status = String(job?.status || '').trim().toLowerCase();
    const total = Number(job?.total || 0);
    const succeeded = Number(job?.succeeded || 0);
    const failed = Number(job?.failed || 0);
    const skipped = Number(job?.skipped || 0);
    const conflicts = Number(job?.conflicts || 0);
    const operation = String(job?.operation || '').trim().toLowerCase();
    const isImportJob = operation === 'import_products';
    const summary = job?.result_summary && typeof job.result_summary === 'object' ? job.result_summary : {};
    const created = Number(summary?.created || 0);
    const updated = Number(summary?.updated || 0);
    const label = isImportJob ? 'Import' : 'Bulk update';

    if (status === 'completed') {
      if (isImportJob) {
        showNotification(
          `Import completed: ${succeeded || total} row${(succeeded || total) === 1 ? '' : 's'}${created || updated ? ` (${created} created, ${updated} updated)` : ''}`,
          'success'
        );
      } else {
        showNotification(`${label} completed for ${succeeded || total} product${(succeeded || total) === 1 ? '' : 's'}`, 'success');
      }
      return;
    }
    if (status === 'completed_with_errors') {
      showNotification(
        isImportJob
          ? `Import finished with ${succeeded} succeeded${created || updated ? ` (${created} created, ${updated} updated)` : ''}, ${failed + conflicts} failed/conflicted${skipped > 0 ? `, ${skipped} skipped` : ''}`
          : `${label} finished with ${succeeded} succeeded, ${failed + conflicts} failed/conflicted${skipped > 0 ? `, ${skipped} skipped` : ''}`,
        'error'
      );
      return;
    }
    if (status === 'cancelled') {
      showNotification(`${label} cancelled`, 'error');
      return;
    }
    if (status === 'failed') {
      showNotification(job?.error_message || `${label} failed`, 'error');
    }
  }, [showNotification]);

  const pollBulkJobAsync = useCallback(async (jobId, pollRunId) => {
    if (!jobId) return;
    try {
      const response = await productsApi.getBulkJob(jobId);
      if (bulkJobPollRunRef.current !== pollRunId) return;
      const nextJob = normalizeBulkJobRecord(response);
      if (!nextJob) return;
      setBulkJob(nextJob);

      if (BULK_JOB_FINAL_STATES.has(String(nextJob.status || '').trim().toLowerCase())) {
        clearBulkJobPolling();
        await refreshProductsAfterBulkJob();
        notifyBulkJobCompletion(nextJob);
        return;
      }
    } catch (error) {
      if (bulkJobPollRunRef.current !== pollRunId) return;
      console.warn('[PRODUCTS_BULK] Failed to poll job status:', error?.message || error);
    }

    if (bulkJobPollRunRef.current !== pollRunId) return;
    bulkJobPollTimerRef.current = setTimeout(() => {
      void pollBulkJobAsync(jobId, pollRunId);
    }, 2500);
  }, [
    clearBulkJobPolling,
    notifyBulkJobCompletion,
    productsApi,
    refreshProductsAfterBulkJob,
  ]);

  const startBulkJobPolling = useCallback((jobId) => {
    const normalizedJobId = Number(jobId || 0);
    if (!normalizedJobId) return;
    clearBulkJobPolling();
    bulkJobPollRunRef.current += 1;
    const pollRunId = bulkJobPollRunRef.current;
    bulkJobPollTimerRef.current = setTimeout(() => {
      void pollBulkJobAsync(normalizedJobId, pollRunId);
    }, 0);
  }, [clearBulkJobPolling, pollBulkJobAsync]);

  const registerBulkJob = useCallback((value) => {
    const nextJob = normalizeBulkJobRecord(value);
    if (!nextJob) return null;
    setBulkJob(nextJob);
    startBulkJobPolling(nextJob.id);
    return nextJob;
  }, [startBulkJobPolling]);

  const buildProductUndoPayload = useCallback((product = {}, { forceActive = false } = {}) => {
    const source = product && typeof product === 'object' ? product : {};
    const categoryValue = String(source.category_path || source.category || 'Groceries').trim() || 'Groceries';
    const brandValue = String(source.brand_path || source.brand || '').trim();

    return {
      name: String(source.name || '').trim(),
      description: source.description ?? null,
      brand: brandValue || null,
      sub_brand: String(source.sub_brand || source.subBrand || '').trim(),
      content: source.content ?? null,
      color: source.color ?? null,
      price: Number(source.price ?? 0),
      mrp: Number(source.mrp ?? source.price ?? 0),
      purchase_pack_size: source.purchase_pack_size ?? source.purchasePackSize ?? null,
      uom: String(source.uom || 'pcs').trim() || 'pcs',
      base_unit: String(source.base_unit || source.uom || 'pcs').trim() || 'pcs',
      uom_type: String(source.uom_type || 'selling').trim() || 'selling',
      conversion_factor: Number(source.conversion_factor || 1) || 1,
      sku: String(source.sku || '').trim(),
      barcode: String(source.barcode || '').trim(),
      image: String(source.image || '').trim(),
      stock: Number(source.stock ?? 0),
      category: categoryValue,
      subcategory: String(source.subcategory || '').trim(),
      expiry_date: source.expiry_date || null,
      defaultDiscount: Number(source.defaultDiscount ?? source.default_discount ?? 0),
      discountType: source.discountType || source.discount_type || 'fixed',
      is_active: forceActive ? 1 : Number(source.is_active ?? 1),
    };
  }, []);

  const handleDeleteProduct = useCallback(async (id) => {
    if (!window.confirm('Mark this product as inactive?')) return;

    try {
      await productsApi.delete(id);
      const refreshResult = await refreshProductsPageAndStats();
      if (!refreshResult.success) {
        showNotification(refreshResult.error.message || 'Product marked inactive, but the list refresh failed', 'error');
        return true;
      }
      showNotification('Product marked inactive', 'success');
      return true;
    } catch (error) {
      showNotification('Failed to delete product', 'error');
      return false;
    }
  }, [productsApi, refreshProductsPageAndStats, showNotification]);

  const handlePermanentDeleteProduct = useCallback(async (product) => {
    if (Number(product?.is_active ?? 1) === 1) {
      showNotification('Deactivate product before permanent delete', 'error');
      return false;
    }
    const productName = String(product?.name || '').trim();
    const confirmed = window.prompt(
      `Permanent delete "${productName}"? This cannot be undone.\nType DELETE to confirm:`,
      ''
    );
    if (confirmed !== 'DELETE') return false;

    try {
      await productsApi.deletePermanent(product.id);
      const refreshResult = await refreshProductsPageAndStats();
      if (!refreshResult.success) {
        showNotification(refreshResult.error.message || 'Product permanently deleted, but the list refresh failed', 'error');
        return true;
      }
      showNotification('Product permanently deleted', 'success');
      return true;
    } catch (error) {
      showNotification(error.message || 'Failed to permanently delete product', 'error');
      return false;
    }
  }, [productsApi, refreshProductsPageAndStats, showNotification]);

  const handleEditProduct = useCallback(async (product) => {
    const productId = Number(product?.id || 0);
    if (!productId) return;
    try {
      setProductEditLoadingId(productId);
      const fullProduct = await productsApi.getById(productId, { include_inactive: 'true' });
      setEditingProduct(fullProduct || product);
      setProductFormMode('full');
      setShowProductForm(true);
    } catch (error) {
      showNotification(error.message || 'Failed to load product details', 'error');
      setEditingProduct(product);
      setProductFormMode('full');
      setShowProductForm(true);
    } finally {
      setProductEditLoadingId(null);
    }
  }, [productsApi, setProductEditLoadingId, setEditingProduct, setShowProductForm, showNotification]);

  const handleAddProduct = useCallback(() => {
    setEditingProduct(null);
    setProductFormMode('full');
    setShowProductForm(true);
  }, [setEditingProduct, setProductFormMode, setShowProductForm]);

  const updateProductWithRetry = useCallback(async (productId, payload) => {
    try {
      return await productsApi.update(productId, payload);
    } catch (error) {
      const conflictType = String(error?.payload?.conflict_type || '');
      if (Number(error?.status) === 409 && conflictType === 'identical') {
        const ok = window.confirm(`${error.message}\n\nContinue anyway?`);
        if (!ok) throw error;
        return productsApi.update(productId, { ...payload, allow_identical: true });
      }
      throw error;
    }
  }, [productsApi]);

  const handleUndoTableAction = useCallback(async (action = {}) => {
    const kind = String(action?.kind || '').trim().toLowerCase();
    const snapshot = action?.snapshot && typeof action.snapshot === 'object' ? action.snapshot : null;
    if (!kind || !snapshot) {
      showNotification('Nothing to undo', 'error');
      return { success: false };
    }

    const productName = String(action?.productName || snapshot?.name || 'product').trim() || 'product';

    try {
      if (kind === 'edit' || kind === 'delete') {
        const payload = buildProductUndoPayload(snapshot, { forceActive: true });
        await updateProductWithRetry(snapshot.id, payload);
      } else if (kind === 'permanent_delete') {
        const payload = buildProductUndoPayload(snapshot, { forceActive: true });
        const createPayload = { ...payload };
        delete createPayload.id;
        delete createPayload.created_at;
        delete createPayload.updated_at;
        await productsApi.create({ ...createPayload, allow_identical: true });
      } else {
        showNotification('Nothing to undo', 'error');
        return { success: false };
      }

      const refreshResult = await refreshProductsPageAndStats();
      if (!refreshResult.success) {
        showNotification(refreshResult.error.message || `Undo applied for "${productName}", but the list refresh failed`, 'error');
        return { success: true, refreshFailed: true };
      }

      if (kind === 'edit') {
        showNotification(`Restored "${productName}" to its previous values`, 'success');
      } else if (kind === 'delete') {
        showNotification(`Reactivated "${productName}"`, 'success');
      } else {
        showNotification(`Restored "${productName}" as a new product`, 'success');
      }

      return { success: true, refreshFailed: false };
    } catch (error) {
      showNotification(error.message || 'Failed to undo product action', 'error');
      return { success: false, error };
    }
  }, [buildProductUndoPayload, productsApi, refreshProductsPageAndStats, showNotification, updateProductWithRetry]);

  const handleBulkProductUpdate = useCallback(async (productIds, payload) => {
    const ids = Array.from(
      new Set(
        (Array.isArray(productIds) ? productIds : [])
          .map((id) => Number(id) || 0)
          .filter(Boolean)
      )
    );
    const body = payload && typeof payload === 'object' ? { ...payload } : {};

    if (ids.length === 0) {
      showNotification('Select at least one product first', 'error');
      return { success: false, updatedIds: [], failedIds: [] };
    }

    try {
      const jobResponse = await productsApi.createBulkJob({
        operation: 'bulk_update',
        product_ids: ids,
        payload: body,
      });
      const nextJob = registerBulkJob(jobResponse);
      showNotification(`Bulk update queued for ${ids.length} product${ids.length === 1 ? '' : 's'}`, 'success');
      return {
        success: true,
        job: nextJob,
        updatedIds: ids,
        failedIds: [],
        failedItems: [],
      };
    } catch (error) {
      showNotification(error.message || 'Failed to queue bulk update', 'error');
      return { success: false, updatedIds: [], failedIds: [], error };
    }
  }, [productsApi, showNotification, startBulkJobPolling]);

  const handleProductSave = useCallback(async (meta = {}) => {
    try {
      await refreshProductsPage();

      const statsData = await statsApi.orders();
      setStats(statsData);

      if (meta?.mode === 'create' && Number(meta?.createdCount) > 1) {
        showNotification(`${meta.createdCount} products added successfully`, 'success');
      } else if (meta?.mode === 'edit_split') {
        const created = Number(meta?.createdCount || 0);
        showNotification(`Product updated and ${created} additional variant(s) created successfully`, 'success');
      } else if (meta?.mode === 'edit') {
        showNotification('Product updated successfully', 'success');
      } else if (meta?.mode === 'create') {
        showNotification('Product added successfully', 'success');
      } else {
        showNotification(editingProduct ? 'Product updated successfully' : 'Product added successfully', 'success');
      }
    } catch (error) {
      showNotification('Failed to refresh products', 'error');
    }
  }, [statsApi, setStats, showNotification, editingProduct, refreshProductsPage]);

  const handleCancelBulkJob = useCallback(async () => {
    if (!bulkJob?.id) return { success: false };
    try {
      const response = await productsApi.cancelBulkJob(bulkJob.id);
      const nextJob = normalizeBulkJobRecord(response);
      if (nextJob) {
        setBulkJob(nextJob);
      }
      clearBulkJobPolling();
      await refreshProductsAfterBulkJob();
      showNotification('Bulk update cancellation requested', 'success');
      return { success: true, job: nextJob };
    } catch (error) {
      showNotification(error.message || 'Failed to cancel bulk update', 'error');
      return { success: false, error };
    }
  }, [bulkJob, clearBulkJobPolling, productsApi, refreshProductsAfterBulkJob, showNotification]);

  const handleRetryFailedBulkJob = useCallback(async () => {
    if (!bulkJob?.id) return { success: false };
    try {
      const response = await productsApi.retryBulkJob(bulkJob.id);
      const nextJob = registerBulkJob(response);
      showNotification('Retry job queued', 'success');
      return { success: true, job: nextJob };
    } catch (error) {
      showNotification(error.message || 'Failed to retry bulk update', 'error');
      return { success: false, error };
    }
  }, [bulkJob, productsApi, showNotification, startBulkJobPolling]);

  const dismissBulkJob = useCallback(() => {
    clearBulkJobPolling();
    setBulkJob(null);
  }, [clearBulkJobPolling]);

  useEffect(() => () => {
    clearBulkJobPolling();
  }, [clearBulkJobPolling]);

  return {
    handleDeleteProduct,
    handlePermanentDeleteProduct,
    handleEditProduct,
    handleAddProduct,
    handleBulkProductUpdate,
    handleUndoTableAction,
    handleProductSave,
    bulkJob,
    handleCancelBulkJob,
    handleRetryFailedBulkJob,
    dismissBulkJob,
    registerBulkJob,
  };
};

export default useAdminProductHandlers;
