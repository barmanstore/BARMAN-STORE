import { useCallback } from 'react';

const useAdminProductHandlers = ({
  productsApi,
  statsApi,
  setProducts,
  setStats,
  showNotification,
  setEditingProduct,
  setShowProductForm,
  setProductEditLoadingId,
  editingProduct,
}) => {
  const handleDeleteProduct = useCallback(async (id) => {
    if (!window.confirm('Mark this product as inactive?')) return;

    try {
      await productsApi.delete(id);
      const updatedProducts = await productsApi.getAll({ include_inactive: true });
      setProducts(updatedProducts);
      showNotification('Product marked inactive', 'success');

      const statsData = await statsApi.orders();
      setStats(statsData);
    } catch (error) {
      showNotification('Failed to delete product', 'error');
    }
  }, [productsApi, statsApi, setProducts, setStats, showNotification]);

  const handlePermanentDeleteProduct = useCallback(async (product) => {
    if (Number(product?.is_active ?? 1) === 1) {
      showNotification('Deactivate product before permanent delete', 'error');
      return;
    }
    const productName = String(product?.name || '').trim();
    const confirmed = window.prompt(
      `Permanent delete "${productName}"? This cannot be undone.\nType DELETE to confirm:`,
      ''
    );
    if (confirmed !== 'DELETE') return;

    try {
      await productsApi.deletePermanent(product.id);
      const updatedProducts = await productsApi.getAll({ include_inactive: true });
      setProducts(updatedProducts);
      showNotification('Product permanently deleted', 'success');
    } catch (error) {
      showNotification(error.message || 'Failed to permanently delete product', 'error');
    }
  }, [productsApi, setProducts, showNotification]);

  const handleEditProduct = useCallback(async (product) => {
    const productId = Number(product?.id || 0);
    if (!productId) return;
    try {
      setProductEditLoadingId(productId);
      const fullProduct = await productsApi.getById(productId, { include_inactive: 'true' });
      setEditingProduct(fullProduct || product);
      setShowProductForm(true);
    } catch (error) {
      showNotification(error.message || 'Failed to load product details', 'error');
      setEditingProduct(product);
      setShowProductForm(true);
    } finally {
      setProductEditLoadingId(null);
    }
  }, [productsApi, setProductEditLoadingId, setEditingProduct, setShowProductForm, showNotification]);

  const handleAddProduct = useCallback(() => {
    setEditingProduct(null);
    setShowProductForm(true);
  }, [setEditingProduct, setShowProductForm]);

  const handleProductSave = useCallback(async (meta = {}) => {
    try {
      const updatedProducts = await productsApi.getAll({ include_inactive: true });
      setProducts(updatedProducts);

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
  }, [productsApi, statsApi, setProducts, setStats, showNotification, editingProduct]);

  return {
    handleDeleteProduct,
    handlePermanentDeleteProduct,
    handleEditProduct,
    handleAddProduct,
    handleProductSave,
  };
};

export default useAdminProductHandlers;
