import { useMemo } from 'react';

const useAdminProductTable = ({
  products,
  productTableSearch,
  productTableCategoryFilter,
  productTableStatusFilter,
  productTableLowStockOnly,
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
    const query = String(productTableSearch || '').trim().toLowerCase();
    let list = Array.isArray(products) ? [...products] : [];

    if (productTableCategoryFilter) {
      list = list.filter((product) => getCategoryPath(product) === productTableCategoryFilter);
    }

    if (productTableStatusFilter !== 'all') {
      list = list.filter((product) => {
        const isActive = Number(product.is_active ?? 1) === 1;
        const stock = asNumber(product.stock, 0);
        if (productTableStatusFilter === 'active') return isActive;
        if (productTableStatusFilter === 'inactive') return !isActive;
        if (productTableStatusFilter === 'available') return isActive && stock > 0;
        if (productTableStatusFilter === 'out_of_stock') return isActive && stock <= 0;
        return true;
      });
    }

    if (productTableLowStockOnly) {
      list = list.filter((product) => asNumber(product.stock, 0) <= 10);
    }

    if (query) {
      list = list.filter((product) => {
        const searchable = [
          product.id,
          product.name,
          product.description,
          getBrandPath(product),
          product.sub_brand,
          product.brand_path,
          product.content,
          product.purchase_pack_size,
          product.color,
          getCategoryPath(product),
          product.subcategory,
          product.category_path,
          product.sku,
          product.barcode,
          product.price,
          product.mrp,
          product.uom,
          product.base_unit,
          product.uom_type,
          product.conversion_factor,
          product.stock,
          product.expiry_date,
          product.defaultDiscount,
          product.default_discount,
          product.discountType,
          product.discount_type,
          Number(product?.is_active ?? 1) === 1 ? 'active' : 'inactive',
          product.created_at,
          product.image,
        ]
          .map((value) => String(value ?? '').toLowerCase())
          .join(' ');
        return searchable.includes(query);
      });
    }

    const readSortValue = (product) => {
      switch (productTableSortField) {
        case 'id':
          return asNumber(product.id, 0);
        case 'name':
          return String(product.name || '').toLowerCase();
        case 'category':
          return getCategoryPath(product).toLowerCase();
        case 'brand':
          return getBrandPath(product).toLowerCase();
        case 'sku':
          return String(product.sku || '').toLowerCase();
        case 'barcode':
          return String(product.barcode || '').toLowerCase();
        case 'price':
          return asNumber(product.price, 0);
        case 'mrp':
          return asNumber(product.mrp, 0);
        case 'stock':
          return asNumber(product.stock, 0);
        case 'defaultDiscount':
          return asNumber(product.defaultDiscount, 0);
        case 'purchase_pack_size':
          return asNumber(product.purchase_pack_size, 0);
        case 'is_active':
          return Number(product.is_active ?? 1);
        case 'created_at':
          return new Date(product.created_at || 0).getTime();
        case 'src':
          return String(product.image || '').toLowerCase();
        default:
          return String(product[productTableSortField] ?? '').toLowerCase();
      }
    };

    list.sort((a, b) => {
      const av = readSortValue(a);
      const bv = readSortValue(b);
      if (av < bv) return productTableSortDir === 'asc' ? -1 : 1;
      if (av > bv) return productTableSortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [
    products,
    productTableSearch,
    productTableCategoryFilter,
    productTableStatusFilter,
    productTableLowStockOnly,
    productTableSortField,
    productTableSortDir,
    getCategoryPath,
    getBrandPath,
    asNumber,
  ]);

  const productTableAllColumnsSelected = productTableVisibleColumns.length === PRODUCT_TABLE_ALL_COLUMN_KEYS.length;
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
    setProductTableSortDir(field === 'name' || field === 'brand' || field === 'category' || field === 'sku' ? 'asc' : 'desc');
  };

  const getSortIndicator = (field) => {
    if (productTableSortField !== field) return '';
    return productTableSortDir === 'asc' ? ' ?' : ' ?';
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
      image: product.image || ''
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
      is_active: Number(product.is_active ?? 1) === 0 ? 1 : (tableEditForm.is_active ? 1 : 0),
      base_unit: product.base_unit || 'pcs',
      uom_type: product.uom_type || 'selling',
      conversion_factor: asNumber(product.conversion_factor, 1) || 1
    };

    if (!payload.name) {
      showNotification('Product name is required', 'error');
      return;
    }
    if (!payload.category) {
      showNotification('Category is required', 'error');
      return;
    }
    if (!(payload.price > 0)) {
      showNotification('Price must be greater than 0', 'error');
      return;
    }
    if (payload.stock < 0) {
      showNotification('Stock must be 0 or more', 'error');
      return;
    }

    try {
      setTableEditSaving(true);
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
      cancelTableEdit();
    } catch (error) {
      showNotification(error.message || 'Failed to update product', 'error');
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
    handleTableEditSave,
  };
};

export default useAdminProductTable;
