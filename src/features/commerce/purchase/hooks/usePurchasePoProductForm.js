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
  setSuccess,
}) => {
  const handleOpenPoProductForm = useCallback(() => {
    const target = getTargetPoProductField();
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
      items[target.index] = buildOrderDraftItem(product, {
        ...currentItem,
        quantity: currentItem.quantity,
        uom: currentItem.uom,
        last_purchase_hint: '',
      });
      return { ...prev, items };
    });
  }, [setOrderFormData, createEmptyOrderItem, buildOrderDraftItem]);

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
    handlePoProductSave,
  };
};

export default usePurchasePoProductForm;
