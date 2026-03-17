const validateProductFormData = (data) => {
  const newErrors = {};

  if (!data.name.trim()) {
    newErrors.name = 'Product name is required';
  }

  if (!data.description.trim()) {
    newErrors.description = 'Description is required';
  }

  if (!data.price || parseFloat(data.price) <= 0) {
    newErrors.price = 'Price must be a positive number';
  }

  if (!String(data.category || '').trim()) {
    newErrors.category = 'Category is required';
  }

  if (!data.stock || parseInt(data.stock) < 0) {
    newErrors.stock = 'Stock must be a non-negative number';
  }

  const conversionFactor = Number(data.conversion_factor);
  if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
    newErrors.conversion_factor = 'Conversion factor must be greater than 0';
  }

  if (String(data.purchase_pack_size || '').trim()) {
    const packSize = Number(data.purchase_pack_size);
    if (!Number.isFinite(packSize) || packSize <= 0) {
      newErrors.purchase_pack_size = 'Purchase pack size must be greater than 0';
    }
  }

  return newErrors;
};

export { validateProductFormData };
