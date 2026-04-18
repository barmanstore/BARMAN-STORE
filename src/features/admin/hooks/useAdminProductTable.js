import { useMemo } from 'react';

const PRODUCT_TABLE_EDITABLE_COLUMN_SEQUENCE = [
  { columnKey: 'name', field: 'name' },
  { columnKey: 'brand', field: 'brand' },
  { columnKey: 'category', field: 'category' },
  { columnKey: 'price', field: 'price' },
  { columnKey: 'mrp', field: 'mrp' },
  { columnKey: 'stock', field: 'stock' },
  { columnKey: 'sku', field: 'sku' },
  { columnKey: 'barcode', field: 'barcode' },
  { columnKey: 'status', field: 'is_active' },
  { columnKey: 'description', field: 'description' },
  { columnKey: 'content', field: 'content' },
  { columnKey: 'purchase_pack_size', field: 'purchase_pack_size' },
  { columnKey: 'color', field: 'color' },
  { columnKey: 'uom', field: 'uom' },
  { columnKey: 'expiry', field: 'expiry_date' },
  { columnKey: 'discount', field: 'defaultDiscount' },
  { columnKey: 'discountType', field: 'discountType' },
  { columnKey: 'src', field: 'image' },
];

const useAdminProductTable = ({
  products,
  productTableSortField,
  productTableSortDir,
  productTableVisibleColumns,
  PRODUCT_TABLE_ALL_COLUMN_KEYS,
  PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS,
  PRODUCT_TABLE_COLUMN_MIN_WIDTH,
  setProductTableVisibleColumns,
  setProductTableSortField,
  setProductTableSortDir,
  selectedProductId,
  setSelectedProductId,
  tableEditId,
  setTableEditId,
  setTableEditFocusField,
  setTableEditForm,
  setTableEditSaving,
  tableEditForm,
  productsApi,
  handleProductSave,
  showNotification,
  getCategoryPath,
  getBrandPath,
  asNumber,
  setQuickEditId,
  tableEditFieldRefs,
}) => {
  const visibleProducts = useMemo(() => {
    return Array.isArray(products) ? [...products] : [];
  }, [products]);

  const productTableAllColumnsSelected =
    productTableVisibleColumns.length === PRODUCT_TABLE_ALL_COLUMN_KEYS.length;
  const isProductTableColumnVisible = (key) => productTableVisibleColumns.includes(key);

  const toggleProductTableColumn = (key) => {
    setProductTableVisibleColumns((prev) => {
      if (prev.includes(key)) {
        const next = prev.filter((item) => item !== key);
        return next.length > 0 ? next : prev;
      }
      const nextSet = new Set([...prev, key]);
      return PRODUCT_TABLE_ALL_COLUMN_KEYS.filter((item) => nextSet.has(item));
    });
  };

  const toggleSelectAllProductTableColumns = (checked) => {
    if (checked) {
      setProductTableVisibleColumns(PRODUCT_TABLE_ALL_COLUMN_KEYS);
      return;
    }
    setProductTableVisibleColumns(PRODUCT_TABLE_DEFAULT_VISIBLE_COLUMNS);
  };

  const productTableCalculatedMinWidth = useMemo(() => {
    const visibleTotal = productTableVisibleColumns.reduce(
      (sum, key) => sum + (PRODUCT_TABLE_COLUMN_MIN_WIDTH[key] || 80),
      0
    );
    return Math.max(420, visibleTotal + 80);
  }, [productTableVisibleColumns, PRODUCT_TABLE_COLUMN_MIN_WIDTH]);

  const visibleEditableFields = useMemo(
    () =>
      PRODUCT_TABLE_EDITABLE_COLUMN_SEQUENCE.filter((column) =>
        productTableVisibleColumns.includes(column.columnKey)
      ).map((column) => column.field),
    [productTableVisibleColumns]
  );

  const selectedVisibleProduct = useMemo(() => {
    const id = Number(selectedProductId || 0);
    if (!id) return null;
    return visibleProducts.find((product) => Number(product.id) === id) || null;
  }, [selectedProductId, visibleProducts]);

  const toggleProductTableSort = (field) => {
    if (productTableSortField === field) {
      setProductTableSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setProductTableSortField(field);
    setProductTableSortDir(
      field === 'name' || field === 'brand' || field === 'category' || field === 'sku'
        ? 'asc'
        : 'desc'
    );
  };

  const getSortIndicator = (field) => {
    if (productTableSortField !== field) return '';
    return productTableSortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const setTableEditFieldRef = (field) => (node) => {
    if (node) {
      tableEditFieldRefs.current[field] = node;
      return;
    }
    delete tableEditFieldRefs.current[field];
  };

  const openTableEdit = (product, focusField = 'name') => {
    setTableEditId(product.id);
    setSelectedProductId(Number(product.id) || 0);
    setTableEditFocusField(focusField);
    setTableEditForm({
      name: product.name || '',
      description: product.description || '',
      brand: getBrandPath(product),
      content: product.content || '',
      purchase_pack_size: String(product.purchase_pack_size ?? ''),
      color: product.color || '',
      category: getCategoryPath(product),
      sku: product.sku || '',
      barcode: product.barcode || '',
      price: String(product.price ?? ''),
      mrp: String(product.mrp ?? ''),
      uom: product.uom || 'pcs',
      stock: String(product.stock ?? 0),
      expiry_date: product.expiry_date ? String(product.expiry_date).slice(0, 10) : '',
      defaultDiscount: String(product.defaultDiscount ?? 0),
      discountType: product.discountType || 'fixed',
      is_active: Number(product.is_active ?? 1) === 1,
      image: product.image || '',
    });
    setQuickEditId(null);
  };

  const handleTableCellClick = (product, field = 'name') => {
    if (!product) return;
    setSelectedProductId(Number(product.id) || 0);
    if (tableEditId !== product.id) {
      openTableEdit(product, field);
      return;
    }
    setTableEditFocusField(field);
  };

  const cancelTableEdit = () => {
    setTableEditId(null);
    setTableEditFocusField('name');
    setTableEditSaving(false);
  };

  const handleTableEditChange = (field, value) => {
    setTableEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTableEditKeyDown = async (event, product, field) => {
    if (!event || (event.key !== 'Enter' && event.key !== 'Tab')) return;
    if (event.isComposing) return;
    if (
      event.key === 'Enter' &&
      String(event.currentTarget?.tagName || '').toUpperCase() === 'SELECT'
    ) {
      return;
    }

    const currentFieldIndex = visibleEditableFields.indexOf(field);
    if (currentFieldIndex === -1) return;

    event.preventDefault();

    const currentProductId = Number(product?.id || 0);
    const currentRowIndex = visibleProducts.findIndex(
      (row) => Number(row.id || 0) === currentProductId
    );
    if (currentRowIndex === -1) return;

    const movingBackward = Boolean(event.shiftKey);
    const nextFieldIndex = currentFieldIndex + (movingBackward ? -1 : 1);
    const currentField = visibleEditableFields[currentFieldIndex];

    const focusNextCell = (nextProduct, nextField) => {
      if (!nextProduct || !nextField) return false;
      if (Number(nextProduct.id || 0) === currentProductId) {
        setSelectedProductId(currentProductId);
        setTableEditFocusField(nextField);
        return true;
      }
      openTableEdit(nextProduct, nextField);
      return true;
    };

    if (nextFieldIndex >= 0 && nextFieldIndex < visibleEditableFields.length) {
      setSelectedProductId(currentProductId);
      setTableEditFocusField(visibleEditableFields[nextFieldIndex]);
      return;
    }

    const nextRowIndex = movingBackward ? currentRowIndex - 1 : currentRowIndex + 1;
    const nextProduct = visibleProducts[nextRowIndex];
    if (!nextProduct) return;

    const shouldSave = await handleTableEditSave(product);
    if (!shouldSave) {
      setTableEditId(currentProductId);
      setSelectedProductId(currentProductId);
      setTableEditFocusField(currentField);
      return;
    }

    const nextField = movingBackward
      ? visibleEditableFields[visibleEditableFields.length - 1]
      : visibleEditableFields[0];
    focusNextCell(nextProduct, nextField);
  };

  const handleTableEditSave = async (product) => {
    const packSizeRaw = String(tableEditForm.purchase_pack_size || '').trim();
    const packSizeValue = packSizeRaw === '' ? null : asNumber(packSizeRaw, 0);
    const payload = {
      name: String(tableEditForm.name || '').trim(),
      description: String(tableEditForm.description || '').trim(),
      brand: String(tableEditForm.brand || '').trim(),
      content: String(tableEditForm.content || '').trim(),
      purchase_pack_size: packSizeValue,
      color: String(tableEditForm.color || '').trim(),
      category: String(tableEditForm.category || '').trim(),
      sku: String(tableEditForm.sku || '').trim(),
      barcode: String(tableEditForm.barcode || '').trim(),
      price: asNumber(tableEditForm.price, 0),
      mrp: asNumber(tableEditForm.mrp, 0),
      uom: String(tableEditForm.uom || 'pcs').trim() || 'pcs',
      stock: asNumber(tableEditForm.stock, 0),
      expiry_date: tableEditForm.expiry_date || null,
      defaultDiscount: asNumber(tableEditForm.defaultDiscount, 0),
      discountType: tableEditForm.discountType === 'percentage' ? 'percentage' : 'fixed',
      image: String(tableEditForm.image || '').trim(),
      is_active: Number(product.is_active ?? 1) === 0 ? 1 : tableEditForm.is_active ? 1 : 0,
      base_unit: product.base_unit || 'pcs',
      uom_type: product.uom_type || 'selling',
      conversion_factor: asNumber(product.conversion_factor, 1) || 1,
    };

    if (!payload.name) {
      showNotification('Product name is required', 'error');
      return false;
    }
    if (!payload.category) {
      showNotification('Category is required', 'error');
      return false;
    }
    if (!(payload.price > 0)) {
      showNotification('Price must be greater than 0', 'error');
      return false;
    }
    if (payload.stock < 0) {
      showNotification('Stock must be 0 or more', 'error');
      return false;
    }

    try {
      setTableEditSaving(true);
      try {
        await productsApi.update(product.id, payload);
      } catch (error) {
        const conflictType = String(error?.payload?.conflict_type || '');
        if (Number(error?.status) === 409 && conflictType === 'identical') {
          const ok = window.confirm(`${error.message}\n\nContinue anyway?`);
          if (!ok) return false;
          await productsApi.update(product.id, { ...payload, allow_identical: true });
        } else {
          throw error;
        }
      }
      await handleProductSave({ mode: 'edit', createdCount: 0 });
      cancelTableEdit();
      return true;
    } catch (error) {
      showNotification(error.message || 'Failed to update product', 'error');
      return false;
    } finally {
      setTableEditSaving(false);
    }
  };

  return {
    visibleProducts,
    productTableAllColumnsSelected,
    isProductTableColumnVisible,
    toggleProductTableColumn,
    toggleSelectAllProductTableColumns,
    productTableCalculatedMinWidth,
    selectedVisibleProduct,
    toggleProductTableSort,
    getSortIndicator,
    setTableEditFieldRef,
    openTableEdit,
    handleTableCellClick,
    cancelTableEdit,
    handleTableEditChange,
    handleTableEditKeyDown,
    handleTableEditSave,
  };
};

export default useAdminProductTable;
