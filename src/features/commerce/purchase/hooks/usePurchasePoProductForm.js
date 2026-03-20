import { useCallback } from 'react';

const usePurchasePoProductForm = ({
  getTargetPoProductField,
  ensureOrderFormItemAtIndex,
  setPoProductFormTarget,
  setActivePoProductField,
  setShowPoProductForm,
  poProductFormTarget,
  setProducts,
  mergeProductsById,
  setOrderFormData,
  createEmptyOrderItem,
  buildOrderDraftItem,
  productsApi,
  setSuccess,
}) => {
  const handleOpenPoProductForm = useCallback((draftName = '') => {
    const target = {
      ...getTargetPoProductField(),
      draftName: String(draftName || '').trim(),
    };
    ensureOrderFormItemAtIndex(target.index);
    setPoProductFormTarget(target);
    setActivePoProductField(target);
    setShowPoProductForm(true);
  }, [
    getTargetPoProductField,
    ensureOrderFormItemAtIndex,
    setPoProductFormTarget,
    setActivePoProductField,
    setShowPoProductForm,
  ]);

  const closePoProductForm = useCallback(() => {
    setShowPoProductForm(false);
    setPoProductFormTarget(null);
  }, [setShowPoProductForm, setPoProductFormTarget]);

  const mergeProductsIntoState = useCallback((incomingProducts = []) => {
    if (!Array.isArray(incomingProducts) || incomingProducts.length === 0) return;
    setProducts((prev) => mergeProductsById(prev, incomingProducts));
  }, [setProducts, mergeProductsById]);

  const applyCreatedProductToPoTarget = useCallback((product, target) => {
    if (!product || !target || !Number.isInteger(target.index) || target.index < 0) return;

    setOrderFormData((prev) => {
      const items = [...prev.items];
      while (items.length <= target.index) {
        items.push(createEmptyOrderItem());
      }
      const currentItem = items[target.index] || createEmptyOrderItem();
      const productRate = Number(product?.price || 0) || 0;
      const productUom = String(product?.base_unit || product?.uom || currentItem.uom || 'pcs').trim() || 'pcs';
      const currentGstRate = Number(currentItem?.gst_rate || 5) || 5;
      items[target.index] = buildOrderDraftItem(product, {
        quantity: currentItem.quantity,
        uom: productUom,
        gst_rate: currentGstRate,
        discount_type: 'percent',
        discount_value: 0,
        reference_rate: productRate,
        reference_rate_source: productRate > 0 ? 'product default rate' : '',
        last_purchase_hint: '',
        last_purchase_rate: 0,
        last_purchase_distributor_name: '',
        last_purchase_created_at: '',
        last_purchase_po_number: '',
        auto_fill_seed_rate: productRate,
        auto_fill_seed_gst_rate: currentGstRate,
        auto_fill_seed_uom: productUom,
      });
      return { ...prev, items };
    });
  }, [setOrderFormData, createEmptyOrderItem, buildOrderDraftItem]);

  const handleInlinePoProductCreate = useCallback(async ({
    targetIndex,
    name,
    price,
    uom,
    category,
  } = {}) => {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) {
      throw new Error('Product name is required.');
    }

    const resolvedPrice = Number(price || 0);
    if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
      throw new Error('Enter a valid rate before adding the new product.');
    }

    const resolvedUom = String(uom || 'pcs').trim() || 'pcs';
    const resolvedCategory = String(category || '').trim() || 'Groceries';
    const target = Number.isInteger(targetIndex) && targetIndex >= 0
      ? { mode: 'entry', index: targetIndex }
      : getTargetPoProductField();

    ensureOrderFormItemAtIndex(target.index);

    try {
      const createdProduct = await productsApi.create({
        name: trimmedName,
        description: trimmedName,
        price: resolvedPrice,
        mrp: resolvedPrice,
        uom: resolvedUom,
        base_unit: resolvedUom,
        uom_type: 'selling',
        conversion_factor: 1,
        stock: 0,
        category: resolvedCategory,
        defaultDiscount: 0,
        discountType: 'fixed',
      });

      if (!createdProduct?.id) {
        throw new Error('Product was not created.');
      }

      mergeProductsIntoState([createdProduct]);
      applyCreatedProductToPoTarget(createdProduct, target);
      return createdProduct;
    } catch (err) {
      if (Number(err?.status) === 409) {
        const conflictType = String(err?.payload?.conflict_type || '').trim().toLowerCase();
        if (conflictType === 'identical') {
          throw new Error(err?.message || 'A matching product already exists. Search again and select it.');
        }
      }
      throw new Error(err?.message || 'Failed to add product.');
    }
  }, [
    applyCreatedProductToPoTarget,
    ensureOrderFormItemAtIndex,
    getTargetPoProductField,
    mergeProductsIntoState,
    productsApi,
  ]);

  const handlePoProductSave = useCallback((meta = {}) => {
    const savedProducts = Array.isArray(meta?.createdProducts) && meta.createdProducts.length > 0
      ? meta.createdProducts
      : (Array.isArray(meta?.savedProducts) ? meta.savedProducts : []);
    mergeProductsIntoState(savedProducts);

    const latestCreatedProduct = savedProducts[savedProducts.length - 1] || null;
    if (latestCreatedProduct && poProductFormTarget) {
      applyCreatedProductToPoTarget(latestCreatedProduct, poProductFormTarget);
      setSuccess(
        savedProducts.length > 1
          ? `${savedProducts.length} products added. Latest product inserted into the PO row.`
          : 'Product added and inserted into the PO row.'
      );
    } else if (savedProducts.length > 0) {
      setSuccess(savedProducts.length > 1 ? `${savedProducts.length} products added.` : 'Product added successfully.');
    }
  }, [
    mergeProductsIntoState,
    poProductFormTarget,
    applyCreatedProductToPoTarget,
    setSuccess,
  ]);

  return {
    handleOpenPoProductForm,
    closePoProductForm,
    handleInlinePoProductCreate,
    handlePoProductSave,
  };
};

export default usePurchasePoProductForm;
