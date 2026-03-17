import { useCallback } from 'react';

const useAdminQuickProductActions = ({
  quickAddForm,
  quickEditForm,
  setQuickAddForm,
  setQuickEditForm,
  setQuickEditId,
  setShowQuickAdd,
  setQuickSaving,
  productsApi,
  handleProductSave,
  showNotification,
  getBrandPath,
  getCategoryPath,
}) => {
  const resetQuickAdd = useCallback(() => {
    setQuickAddForm({
      name: '',
      category: '',
      price: '',
      stock: '',
      image: '',
    });
  }, [setQuickAddForm]);

  const makeQuickPayload = useCallback((form, baseProduct = {}) => {
    const cleanName = String(form.name || '').trim();
    const cleanCategory = String(form.category || '').trim();
    const cleanDescription = String(baseProduct.description || '').trim() || `${cleanName} product`;
    const price = Number(form.price || 0);
    const stock = Number(form.stock || 0);

    return {
      name: cleanName,
      description: cleanDescription,
      brand: getBrandPath(baseProduct) || '',
      content: baseProduct.content || '',
      color: baseProduct.color || '',
      price,
      mrp: Number(baseProduct.mrp || 0) > 0 ? Number(baseProduct.mrp) : price,
      uom: baseProduct.uom || 'pcs',
      base_unit: baseProduct.base_unit || 'pcs',
      uom_type: baseProduct.uom_type || 'selling',
      conversion_factor: Number(baseProduct.conversion_factor || 1) || 1,
      barcode: baseProduct.barcode || '',
      sku: baseProduct.sku || '',
      image: String(form.image || '').trim(),
      stock,
      expiry_date: baseProduct.expiry_date || null,
      category: cleanCategory,
      defaultDiscount: Number(baseProduct.defaultDiscount || 0) || 0,
      discountType: baseProduct.discountType || 'fixed',
    };
  }, [getBrandPath]);

  const validateQuickForm = useCallback((form) => {
    if (!String(form.name || '').trim()) {
      showNotification('Product name is required', 'error');
      return false;
    }
    if (!String(form.category || '').trim()) {
      showNotification('Category is required', 'error');
      return false;
    }
    if (!(Number(form.price) > 0)) {
      showNotification('Price must be greater than 0', 'error');
      return false;
    }
    if (!(Number(form.stock) >= 0)) {
      showNotification('Stock must be 0 or more', 'error');
      return false;
    }
    return true;
  }, [showNotification]);

  const handleQuickAddSave = useCallback(async () => {
    if (!validateQuickForm(quickAddForm)) return;

    try {
      setQuickSaving(true);
      const payload = makeQuickPayload(quickAddForm);
      try {
        await productsApi.create(payload);
      } catch (error) {
        const conflictType = String(error?.payload?.conflict_type || '');
        if (Number(error?.status) === 409 && conflictType === 'identical') {
          const ok = window.confirm(`${error.message}\n\nContinue anyway?`);
          if (!ok) return;
          await productsApi.create({ ...payload, allow_identical: true });
        } else {
          throw error;
        }
      }
      await handleProductSave({ mode: 'create', createdCount: 1 });
      setShowQuickAdd(false);
      resetQuickAdd();
    } catch (error) {
      showNotification(error.message || 'Failed to add product', 'error');
    } finally {
      setQuickSaving(false);
    }
  }, [
    quickAddForm,
    validateQuickForm,
    makeQuickPayload,
    productsApi,
    handleProductSave,
    setShowQuickAdd,
    resetQuickAdd,
    showNotification,
    setQuickSaving,
  ]);

  const startQuickEdit = useCallback((product) => {
    setQuickEditId(product.id);
    setQuickEditForm({
      name: product.name || '',
      category: getCategoryPath(product),
      price: String(product.price ?? ''),
      stock: String(product.stock ?? 0),
      image: product.image || '',
    });
  }, [setQuickEditId, setQuickEditForm, getCategoryPath]);

  const cancelQuickEdit = useCallback(() => {
    setQuickEditId(null);
    setQuickEditForm({
      name: '',
      category: '',
      price: '',
      stock: '',
      image: '',
    });
  }, [setQuickEditId, setQuickEditForm]);

  const handleQuickEditSave = useCallback(async (product) => {
    if (!validateQuickForm(quickEditForm)) return;

    try {
      setQuickSaving(true);
      const payload = makeQuickPayload(quickEditForm, product);
      try {
        await productsApi.update(product.id, payload);
      } catch (error) {
        const conflictType = String(error?.payload?.conflict_type || '');
        if (Number(error?.status) === 409 && conflictType === 'identical') {
          const ok = window.confirm(`${error.message}\n\nContinue anyway?`);
          if (!ok) return;
          await productsApi.update(product.id, { ...payload, allow_identical: true });
        } else {
          throw error;
        }
      }
      await handleProductSave({ mode: 'edit', createdCount: 0 });
      cancelQuickEdit();
    } catch (error) {
      showNotification(error.message || 'Failed to update product', 'error');
    } finally {
      setQuickSaving(false);
    }
  }, [
    quickEditForm,
    validateQuickForm,
    makeQuickPayload,
    productsApi,
    handleProductSave,
    cancelQuickEdit,
    showNotification,
    setQuickSaving,
  ]);

  return {
    resetQuickAdd,
    handleQuickAddSave,
    startQuickEdit,
    cancelQuickEdit,
    handleQuickEditSave,
  };
};

export default useAdminQuickProductActions;
