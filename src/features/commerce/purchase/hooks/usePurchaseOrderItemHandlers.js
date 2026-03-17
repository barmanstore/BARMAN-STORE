import { useCallback } from 'react';

const usePurchaseOrderItemHandlers = ({
  orderFormData,
  setOrderFormData,
  products,
  productsApi,
  resolveProductByInput,
  getProductSearchLabel,
  resolvePurchaseUnitForProduct,
  normalizeGstRateOption,
  toNumber,
  findProductForItem,
}) => {
  const handleOrderItemChange = useCallback(async (index, field, value) => {
    const items = [...orderFormData.items];
    const nextValue = field === 'gst_rate' ? normalizeGstRateOption(value) : value;
    items[index][field] = nextValue;
    if (field === 'quantity') {
      items[index].quantity = Math.max(1, toNumber(nextValue));
    }

    if (field === 'product_id') {
      const selectedProductId = String(value || '');
      const product = products.find((p) => String(p.id) === selectedProductId);
      if (product) {
        const baseRate = toNumber(product.price);
        const defaultUom = resolvePurchaseUnitForProduct(product, product.base_unit || product.uom || 'pcs');
        items[index].product_name = product.name;
        items[index].product_query = getProductSearchLabel(product);
        items[index].unit_price = baseRate;
        items[index].rate = baseRate;
        items[index].uom = defaultUom;
        items[index].last_purchase_hint = '';
      } else {
        items[index].product_query = '';
        items[index].product_name = '';
        items[index].uom = 'pcs';
        items[index].last_purchase_hint = '';
      }
      setOrderFormData((prev) => ({ ...prev, items }));

      if (!selectedProductId) return;

      try {
        const suggestion = await productsApi.getLastPurchase(selectedProductId);
        if (!suggestion?.found) return;

        setOrderFormData((prev) => {
          const nextItems = [...prev.items];
          const current = nextItems[index];
          if (!current || String(current.product_id) !== selectedProductId) return prev;
          const selectedProduct = products.find((p) => String(p.id) === selectedProductId) || null;

          const suggestedRate = toNumber(suggestion.rate ?? suggestion.unit_price ?? current.rate ?? current.unit_price);
          const suggestedGst = normalizeGstRateOption(suggestion.gst_rate ?? current.gst_rate ?? 5);
          const suggestedDate = suggestion.created_at ? new Date(suggestion.created_at).toLocaleDateString() : '';
          const suggestedPo = suggestion.po_number || 'last PO';
          const suggestedUom = resolvePurchaseUnitForProduct(
            selectedProduct,
            suggestion.uom || current.uom || selectedProduct?.base_unit || selectedProduct?.uom || 'pcs'
          );

          nextItems[index] = {
            ...current,
            unit_price: suggestedRate,
            rate: suggestedRate,
            gst_rate: suggestedGst,
            uom: suggestedUom,
            last_purchase_hint: `Suggested from ${suggestedPo}${suggestedDate ? ` (${suggestedDate})` : ''}`,
          };
          return { ...prev, items: nextItems };
        });
      } catch (_) {
        // keep product defaults when suggestion API is unavailable
      }
      return;
    }

    if (field === 'uom') {
      const selectedProduct = findProductForItem(products, items[index]);
      items[index].uom = resolvePurchaseUnitForProduct(selectedProduct, value);
    }

    if (field === 'rate') {
      items[index].unit_price = toNumber(value);
    }

    if (field === 'unit_price') {
      items[index].rate = toNumber(value);
    }

    setOrderFormData((prev) => ({ ...prev, items }));
  }, [
    orderFormData.items,
    normalizeGstRateOption,
    toNumber,
    products,
    resolvePurchaseUnitForProduct,
    getProductSearchLabel,
    setOrderFormData,
    productsApi,
    findProductForItem,
  ]);

  const handleOrderProductInputChange = useCallback((index, value) => {
    const items = [...orderFormData.items];
    items[index].product_query = value;
    const match = resolveProductByInput(value);
    if (!match) {
      items[index].product_id = '';
      items[index].product_name = value;
      items[index].last_purchase_hint = '';
      setOrderFormData((prev) => ({ ...prev, items }));
      return;
    }
    setOrderFormData((prev) => ({ ...prev, items }));
    handleOrderItemChange(index, 'product_id', String(match.id));
  }, [orderFormData.items, resolveProductByInput, setOrderFormData, handleOrderItemChange]);

  return {
    handleOrderItemChange,
    handleOrderProductInputChange,
  };
};

export default usePurchaseOrderItemHandlers;
