import { useCallback } from 'react';

const usePurchaseReturnHandlers = ({
  returnFormData,
  setReturnFormData,
  setShowReturnForm,
  setReturnSubmitting,
  returnSubmitLockRef,
  setError,
  products,
  resolvePurchaseUnitForProduct,
  findProductForItem,
  toNumber,
  purchaseReturnsApi,
  user,
  fetchReturns,
}) => {
  const handleReturnFormOpen = useCallback(() => {
    setReturnFormData({
      distributor_id: '',
      reference_po: '',
      return_type: 'return',
      reason: '',
      items: [],
    });
    setReturnSubmitting(false);
    returnSubmitLockRef.current = false;
    setShowReturnForm(true);
  }, [setReturnFormData, setReturnSubmitting, returnSubmitLockRef, setShowReturnForm]);

  const closeReturnForm = useCallback(() => {
    setShowReturnForm(false);
    setReturnFormData({
      distributor_id: '',
      reference_po: '',
      return_type: 'return',
      reason: '',
      items: [],
    });
    setReturnSubmitting(false);
    returnSubmitLockRef.current = false;
  }, [setShowReturnForm, setReturnFormData, setReturnSubmitting, returnSubmitLockRef]);

  const handleReturnItemAdd = useCallback(() => {
    setReturnFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { product_id: '', product_name: '', quantity: 1, uom: 'pcs', unit_price: 0, reason: '' },
      ],
    }));
  }, [setReturnFormData]);

  const handleReturnItemChange = useCallback(
    (index, field, value) => {
      const items = [...returnFormData.items];
      items[index][field] = value;

      if (field === 'product_id') {
        const product = products.find((p) => p.id === parseInt(value));
        if (product) {
          const defaultUom = resolvePurchaseUnitForProduct(
            product,
            product.base_unit || product.uom || 'pcs'
          );
          items[index].product_name = product.name;
          items[index].unit_price = toNumber(product.price);
          items[index].uom = defaultUom;
        }
      }

      if (field === 'uom') {
        const product = findProductForItem(products, items[index]);
        items[index].uom = resolvePurchaseUnitForProduct(product, value);
      }

      setReturnFormData((prev) => ({ ...prev, items }));
    },
    [
      returnFormData.items,
      products,
      resolvePurchaseUnitForProduct,
      toNumber,
      findProductForItem,
      setReturnFormData,
    ]
  );

  const handleReturnItemRemove = useCallback(
    (index) => {
      setReturnFormData((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    },
    [setReturnFormData]
  );

  const handleReturnSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (returnSubmitLockRef.current) return;
      returnSubmitLockRef.current = true;
      setError('');
      setReturnSubmitting(true);

      try {
        const validItems = returnFormData.items.filter(
          (item) => item.product_id && item.quantity > 0
        );
        if (validItems.length === 0) {
          returnSubmitLockRef.current = false;
          setReturnSubmitting(false);
          setError('Please add at least one item');
          return;
        }

        const normalizedItems = validItems.map((item) => {
          const product = products.find((p) => String(p.id) === String(item.product_id)) || null;
          return {
            ...item,
            product_id: Number(item.product_id),
            quantity: Math.max(0, toNumber(item.quantity)),
            unit_price: Math.max(0, toNumber(item.unit_price)),
            uom: resolvePurchaseUnitForProduct(
              product,
              item.uom || product?.base_unit || product?.uom || 'pcs'
            ),
          };
        });

        await purchaseReturnsApi.create({
          distributor_id: returnFormData.distributor_id,
          reference_po: returnFormData.reference_po,
          return_type: returnFormData.return_type,
          reason: returnFormData.reason,
          items: normalizedItems,
          created_by: user?.id,
        });

        closeReturnForm();
        fetchReturns();
      } catch (err) {
        setError(err.message || 'Failed to create return');
      } finally {
        returnSubmitLockRef.current = false;
        setReturnSubmitting(false);
      }
    },
    [
      returnFormData,
      products,
      resolvePurchaseUnitForProduct,
      toNumber,
      purchaseReturnsApi,
      user,
      closeReturnForm,
      fetchReturns,
      setError,
      setReturnSubmitting,
      returnSubmitLockRef,
    ]
  );

  return {
    handleReturnFormOpen,
    closeReturnForm,
    handleReturnItemAdd,
    handleReturnItemChange,
    handleReturnItemRemove,
    handleReturnSubmit,
  };
};

export default usePurchaseReturnHandlers;
