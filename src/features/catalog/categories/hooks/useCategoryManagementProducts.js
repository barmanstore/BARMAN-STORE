import { useEffect, useMemo, useRef, useState } from 'react';

const toNumericId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const useCategoryManagementProducts = ({
  categoriesApi,
  selectedCategoryId,
  productCategoryOptions,
  setError,
  setSuccess,
  clearStatusAfterDelay,
  fetchCategories,
}) => {
  const [productsLoading, setProductsLoading] = useState(false);
  const [categoryProducts, setCategoryProducts] = useState([]);
  const [dragProductId, setDragProductId] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingProductCategoryId, setEditingProductCategoryId] = useState('');
  const [editingProductCategoryQuery, setEditingProductCategoryQuery] = useState('');
  const [editingProductCategoryFocusIndex, setEditingProductCategoryFocusIndex] = useState(-1);
  const [savingProductEdit, setSavingProductEdit] = useState(false);
  const productCategoryInputRef = useRef(null);

  const filteredProductCategoryOptions = useMemo(() => {
    const query = String(editingProductCategoryQuery || '').trim().toLowerCase();
    if (!query) return productCategoryOptions.slice(0, 40);
    return productCategoryOptions
      .filter((option) => {
        const path = String(option.path || '').toLowerCase();
        const label = String(option.label || '').toLowerCase();
        return path.includes(query) || label.includes(query);
      })
      .slice(0, 40);
  }, [editingProductCategoryQuery, productCategoryOptions]);

  const fetchCategoryProducts = async (categoryId) => {
    const id = toNumericId(categoryId);
    if (!id) {
      setCategoryProducts([]);
      return;
    }
    setProductsLoading(true);
    try {
      const rows = await categoriesApi.getProducts(id, { include_inactive: 'true' });
      setCategoryProducts(Array.isArray(rows) ? rows : []);
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to fetch category products');
      setCategoryProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategoryProducts(selectedCategoryId);
  }, [selectedCategoryId]);

  useEffect(() => {
    if (!Number(editingProductId)) return;
    if (!filteredProductCategoryOptions.length) {
      setEditingProductCategoryFocusIndex(-1);
      return;
    }
    const selectedIndex = filteredProductCategoryOptions.findIndex(
      (option) => Number(option.id) === Number(editingProductCategoryId)
    );
    if (selectedIndex >= 0) {
      setEditingProductCategoryFocusIndex(selectedIndex);
      return;
    }
    setEditingProductCategoryFocusIndex(0);
  }, [editingProductId, editingProductCategoryId, filteredProductCategoryOptions]);

  const handleDropProductOnCategory = async (targetCategoryId) => {
    const productId = toNumericId(dragProductId);
    const categoryId = toNumericId(targetCategoryId);
    if (!productId || !categoryId) return;
    setDragProductId(null);
    try {
      await categoriesApi.assignProduct(productId, categoryId);
      setSuccess('Product category updated');
      await fetchCategories();
      await fetchCategoryProducts(selectedCategoryId);
      clearStatusAfterDelay();
    } catch (dropError) {
      setError(dropError.message || 'Failed to move product to category');
      clearStatusAfterDelay();
    }
  };

  const startEditingProductCategory = (product) => {
    const productId = toNumericId(product?.id);
    if (!productId) return;
    const currentCategoryId = toNumericId(product?.category_id);
    const matchedOption = productCategoryOptions.find((option) => Number(option.id) === Number(currentCategoryId));
    setEditingProductId(productId);
    setEditingProductCategoryId(currentCategoryId ? String(currentCategoryId) : '');
    setEditingProductCategoryQuery(
      String(
        matchedOption?.path
        || product?.category_path
        || product?.category
        || ''
      ).trim()
    );
    setEditingProductCategoryFocusIndex(-1);
    setTimeout(() => {
      if (productCategoryInputRef.current) productCategoryInputRef.current.focus();
    }, 40);
  };

  const cancelEditingProductCategory = () => {
    setEditingProductId(null);
    setEditingProductCategoryId('');
    setEditingProductCategoryQuery('');
    setEditingProductCategoryFocusIndex(-1);
  };

  const chooseEditingProductCategory = (categoryId) => {
    const numericId = toNumericId(categoryId);
    if (!numericId) return;
    const matchedOption = productCategoryOptions.find((option) => Number(option.id) === numericId);
    setEditingProductCategoryId(String(numericId));
    if (matchedOption) setEditingProductCategoryQuery(String(matchedOption.path || matchedOption.label || '').trim());
  };

  const handleEditingCategoryQueryChange = (event) => {
    const query = String(event.target.value || '');
    setEditingProductCategoryQuery(query);
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setEditingProductCategoryId('');
      setEditingProductCategoryFocusIndex(-1);
      return;
    }
    const exactMatch = productCategoryOptions.find((option) => {
      const path = String(option.path || '').trim().toLowerCase();
      const label = String(option.label || '').trim().toLowerCase();
      return normalized === path || normalized === label;
    });
    setEditingProductCategoryId(exactMatch ? String(exactMatch.id) : '');
    setEditingProductCategoryFocusIndex(0);
  };

  const handleEditingCategoryQueryKeyDown = (event) => {
    if (!Number(editingProductId)) return;
    const options = filteredProductCategoryOptions;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelEditingProductCategory();
      return;
    }
    if (!options.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setEditingProductCategoryFocusIndex((prev) => {
        if (prev < 0) return 0;
        return (prev + 1) % options.length;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setEditingProductCategoryFocusIndex((prev) => {
        if (prev < 0) return options.length - 1;
        return (prev - 1 + options.length) % options.length;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const safeIndex = editingProductCategoryFocusIndex >= 0
        ? editingProductCategoryFocusIndex
        : 0;
      const highlighted = options[safeIndex];
      if (highlighted) chooseEditingProductCategory(highlighted.id);
    }
  };

  const saveProductCategoryEdit = async (product) => {
    const productId = toNumericId(product?.id);
    const targetCategoryId = toNumericId(editingProductCategoryId);
    if (!productId) return;
    if (!targetCategoryId) {
      setError('Please select a valid target category');
      clearStatusAfterDelay();
      return;
    }

    setSavingProductEdit(true);
    setError('');
    try {
      await categoriesApi.assignProduct(productId, targetCategoryId);
      setSuccess('Product category updated');
      cancelEditingProductCategory();
      await fetchCategories();
      await fetchCategoryProducts(selectedCategoryId);
      clearStatusAfterDelay();
    } catch (saveError) {
      setError(saveError.message || 'Failed to update product category');
      clearStatusAfterDelay();
    } finally {
      setSavingProductEdit(false);
    }
  };

  const handleDragStart = (productId) => {
    setDragProductId(productId);
  };

  const handleDragEnd = () => {
    setDragProductId(null);
  };

  return {
    productsLoading,
    categoryProducts,
    editingProductId,
    editingProductCategoryId,
    editingProductCategoryQuery,
    editingProductCategoryFocusIndex,
    savingProductEdit,
    filteredProductCategoryOptions,
    productCategoryInputRef,
    setEditingProductCategoryFocusIndex,
    startEditingProductCategory,
    cancelEditingProductCategory,
    chooseEditingProductCategory,
    handleEditingCategoryQueryChange,
    handleEditingCategoryQueryKeyDown,
    saveProductCategoryEdit,
    handleDropProductOnCategory,
    handleDragStart,
    handleDragEnd,
  };
};

export default useCategoryManagementProducts;
